import {
  ApiError,
  type ApiErrorInit,
  attachErrorReference,
  AuthenticationError,
  ConnectionError,
  type ErrorReference,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from "../errors.js";
import type { TokenManager } from "../auth.js";
import { SUCCESS_CODES as SUCCESS_CODE_LIST } from "../constants.js";
import { buildQuery, isRecord, type Query, timing } from "./utils.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions {
  method: HttpMethod;
  /** Path starting with `/`, already validated and encoded. */
  path: string;
  query?: Query | undefined;
  body?: unknown;
  /**
   * Token endpoint request:
   * - `"obtain"` (issue/refresh): sent without a bearer token, retried like a GET,
   *   and any 4xx other than 429 is an AuthenticationError.
   * - `"revoke"`: an ordinary authenticated request.
   * Both keep `data` out of error bodies, since it may hold tokens.
   */
  token?: "obtain" | "revoke";
  /**
   * Idempotency reference of a money-moving request: added to the returned data if
   * missing, and attached to any error as `err.reference`.
   */
  reference?: ErrorReference;
}

export interface HttpClientConfig {
  baseUrl: string;
  accountId: string;
  timeout: number;
  maxRetries: number;
  fetch: typeof fetch;
  userAgent: string;
}

const SUCCESS_CODES: ReadonlySet<string> = new Set(SUCCESS_CODE_LIST);
const MAX_BACKOFF_MS = 8000;
const INITIAL_BACKOFF_MS = 500;
const MAX_RETRY_AFTER_MS = 60_000;

/** Delay before retry `attempt` (0-based): 0.5 s, 1 s, 2 s … capped at 8 s, with jitter. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** attempt);
  // Up to 25% downward jitter so concurrent clients don't retry in lockstep.
  return Math.round(base * (1 - 0.25 * random()));
}

/** Parse `Retry-After` (seconds or HTTP date) into seconds. */
export function parseRetryAfter(
  value: string | null,
  now = Date.now()
): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

interface ParsedResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

export class HttpClient {
  readonly #config: HttpClientConfig;
  #tokens: TokenManager | null = null;

  constructor(config: HttpClientConfig) {
    this.#config = config;
  }

  setTokenManager(tokens: TokenManager): void {
    this.#tokens = tokens;
  }

  /** Make a request and return the unwrapped `data` of a successful envelope. */
  async request<T>(opts: RequestOptions): Promise<T> {
    const { reference } = opts;
    if (!reference) return (await this.#authorized(opts)) as T;
    try {
      return withReference(await this.#authorized(opts), reference) as T;
    } catch (err) {
      // The outcome may be unknown (timeout, 5xx): the caller needs the reference to requery.
      attachErrorReference(err, reference);
      throw err;
    }
  }

  async #authorized(opts: RequestOptions): Promise<unknown> {
    if (opts.token === "obtain" || !this.#tokens) {
      return this.#send(opts, undefined);
    }
    const token = await this.#tokens.getAccessToken();
    try {
      return await this.#send(opts, token);
    } catch (err) {
      if (!(err instanceof AuthenticationError) || err.httpStatus !== 401) throw err;
      // A 401 means the request was not processed, so retrying once is safe even for POST.
      await this.#tokens.invalidate(token);
      const fresh = await this.#tokens.getAccessToken();
      return this.#send(opts, fresh);
    }
  }

  async #send(opts: RequestOptions, token: string | undefined): Promise<unknown> {
    const retryable = opts.method === "GET" || opts.token === "obtain";
    const maxAttempts = retryable ? this.#config.maxRetries + 1 : 1;
    const url = `${this.#config.baseUrl}${opts.path}${buildQuery(opts.query)}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      accountId: this.#config.accountId,
      "User-Agent": this.#config.userAgent,
    };
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);

    for (let attempt = 0; ; attempt++) {
      const isLast = attempt + 1 >= maxAttempts;
      let res: ParsedResponse;
      try {
        res = await this.#fetchOnce(url, opts.method, headers, body);
      } catch (err) {
        const wrapped =
          err instanceof TimeoutError
            ? new TimeoutError(
                `Nomba request timed out after ${this.#config.timeout} ms [${opts.method} ${opts.path}]`,
                { method: opts.method, path: opts.path }
              )
            : new ConnectionError(
                `Could not connect to Nomba [${opts.method} ${opts.path}]`,
                { method: opts.method, path: opts.path, cause: err }
              );
        if (isLast) throw wrapped;
        await timing.sleep(backoffMs(attempt));
        continue;
      }

      if (!isLast && (res.status === 429 || res.status >= 500)) {
        const retryAfter =
          res.status === 429
            ? parseRetryAfter(res.headers.get("retry-after"))
            : undefined;
        await timing.sleep(
          retryAfter !== undefined
            ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
            : backoffMs(attempt)
        );
        continue;
      }
      return this.#unwrap(res, opts);
    }
  }

  async #fetchOnce(
    url: string,
    method: HttpMethod,
    headers: Record<string, string>,
    body: string | undefined
  ): Promise<ParsedResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#config.timeout);
    try {
      const response = await this.#config.fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        // Never follow redirects: the Authorization header must only go to Nomba.
        redirect: "error",
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: parseJson(text),
      };
    } catch (err) {
      if (timedOut) throw new TimeoutError("timeout");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  #unwrap(res: ParsedResponse, opts: RequestOptions): unknown {
    const envelope = isRecord(res.body) ? res.body : undefined;
    const rawCode = envelope?.code;
    const code =
      rawCode === undefined || rawCode === null ? undefined : String(rawCode as string);
    const ok = res.status >= 200 && res.status < 300;
    const notJson = typeof res.body === "string";
    if (ok && !notJson && (code === undefined || SUCCESS_CODES.has(code))) {
      if (envelope && "data" in envelope) return envelope.data;
      return envelope ? null : (res.body ?? null);
    }

    const descriptionField = notJson
      ? "response was not valid JSON"
      : (envelope?.description ?? envelope?.message);
    const init: ApiErrorInit = {
      httpStatus: res.status,
      code,
      description:
        typeof descriptionField === "string" && descriptionField !== ""
          ? descriptionField
          : undefined,
      // Token endpoints: never keep a response body that might contain tokens.
      body: opts.token ? redactTokenBody(res.body) : res.body,
      method: opts.method,
      path: opts.path,
    };
    throw errorFor(init, res.headers, opts);
  }
}

function errorFor(init: ApiErrorInit, headers: Headers, opts: RequestOptions): ApiError {
  const status = init.httpStatus ?? 0;
  if (status === 429) {
    return new RateLimitError({
      ...init,
      retryAfter: parseRetryAfter(headers.get("retry-after")),
      rateLimit: {
        limit: headers.get("x-rate-limit-limit") ?? undefined,
        remaining: headers.get("x-rate-limit-remaining") ?? undefined,
        window: headers.get("x-rate-limit-window") ?? undefined,
      },
    });
  }
  if (status >= 500) return new ServerError(init);
  if (opts.token === "obtain") return new AuthenticationError(init);
  if (status === 401) return new AuthenticationError(init);
  if (status === 403) return new PermissionDeniedError(init);
  if (status === 404) return new NotFoundError(init);
  if (status === 400 || status === 422) return new ValidationError(init);
  return new ApiError(init);
}

function parseJson(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Add the reference to successful data that doesn't already carry it. */
function withReference(data: unknown, { field, value }: ErrorReference): unknown {
  if (data === null || data === undefined) return { [field]: value };
  if (
    isRecord(data) &&
    (data[field] === undefined || data[field] === null || data[field] === "")
  ) {
    return { ...data, [field]: value };
  }
  return data;
}

function redactTokenBody(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const { data: _data, ...rest } = body;
  return rest;
}
