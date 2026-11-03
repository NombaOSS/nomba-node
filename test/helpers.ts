import { Nomba, type NombaOptions } from "../src/index.js";

export interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string | undefined;
  init: RequestInit;
}

export type Responder = Response | Error | ((call: Call) => Response | Promise<Response>);

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function ok(data: unknown, code = "00"): Response {
  return json({ code, description: "Success", data });
}

export function apiError(
  status: number,
  description = "Something went wrong",
  headers: Record<string, string> = {}
): Response {
  return json({ code: String(status), description }, status, headers);
}

export const FAKE = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret-DO-NOT-LEAK",
  accountId: "test-account-id",
};

export function tokenData(n = 1, expiresInMs = 30 * 60 * 1000) {
  return {
    businessId: "test-business",
    access_token: `test-access-token-${n}`,
    refresh_token: `test-refresh-token-${n}`,
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

/** A fake Nomba API. Routes are FIFO queues keyed by "METHOD /path". */
export class MockApi {
  readonly calls: Call[] = [];
  readonly routes = new Map<string, Responder[]>();
  /** Automatically answer token issue requests that have no queued responder. */
  autoIssue = true;
  issued = 0;

  on(method: string, path: string, ...responders: Responder[]): this {
    const key = `${method} ${path}`;
    const list = this.routes.get(key) ?? [];
    list.push(...responders);
    this.routes.set(key, list);
    return this;
  }

  /** Calls excluding token issue/refresh. */
  get apiCalls(): Call[] {
    return this.calls.filter((c) => !c.url.pathname.includes("/v1/auth/token/"));
  }

  callsTo(method: string, path: string): Call[] {
    return this.calls.filter((c) => c.method === method && c.url.pathname === path);
  }

  readonly fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
      headers[k] = v;
    }
    const rawBody = typeof init.body === "string" ? init.body : undefined;
    const call: Call = {
      url,
      method: init.method ?? "GET",
      headers,
      body: rawBody === undefined ? undefined : JSON.parse(rawBody),
      rawBody,
      init,
    };
    this.calls.push(call);
    const key = `${call.method} ${url.pathname}`;
    const queue = this.routes.get(key);
    let responder = queue?.shift();
    if (
      responder === undefined &&
      call.method === "POST" &&
      url.pathname.endsWith("/v1/auth/token/issue") &&
      this.autoIssue
    ) {
      this.issued += 1;
      responder = ok(tokenData(this.issued));
    }
    if (responder === undefined) throw new Error(`MockApi: unexpected request ${key}`);
    if (responder instanceof Error) throw responder;
    if (typeof responder === "function") return responder(call);
    return responder;
  };
}

export function client(mock: MockApi, options: NombaOptions = {}): Nomba {
  return new Nomba({ ...FAKE, fetch: mock.fetch as typeof fetch, ...options });
}
