import {
  InMemoryTokenStore,
  TokenManager,
  type TokenResponse,
  type TokenStore,
} from "./auth.js";
import { BASE_URLS, type Environment } from "./constants.js";
import { ConfigurationError } from "./errors.js";
import { HttpClient } from "./internal/http.js";
import { readEnv, runtimeVersion } from "./internal/utils.js";
import { Accounts } from "./resources/accounts.js";
import { AuthResource } from "./resources/auth.js";
import type { ResourceContext } from "./resources/base.js";
import { Bills } from "./resources/bills.js";
import { Checkout } from "./resources/checkout.js";
import { DirectDebits } from "./resources/directDebits.js";
import { GlobalCollection } from "./resources/globalCollection.js";
import { GlobalPayout } from "./resources/globalPayout.js";
import { Terminals } from "./resources/terminals.js";
import { Transactions } from "./resources/transactions.js";
import { Transfers } from "./resources/transfers.js";
import { VirtualAccounts } from "./resources/virtualAccounts.js";
import { VERSION } from "./version.js";
import { webhooks } from "./webhooks.js";

export interface NombaOptions {
  /** Defaults to env `NOMBA_CLIENT_ID`. */
  clientId?: string;
  /** Defaults to env `NOMBA_CLIENT_SECRET`. */
  clientSecret?: string;
  /** Parent account ID, sent as the `accountId` header. Defaults to env `NOMBA_ACCOUNT_ID`. */
  accountId?: string;
  /** `"sandbox"` (default) or `"production"`. Defaults to env `NOMBA_ENVIRONMENT`. */
  environment?: Environment;
  /** Override the API base URL (tests, proxies). Must be https unless the host is localhost. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeout?: number;
  /** Automatic retries for GET and token requests. Default 2. POST/PUT/DELETE are never retried. */
  maxRetries?: number;
  /** Where to keep the access token. Default: in memory. */
  tokenStore?: TokenStore;
  /** Custom `fetch` implementation. Default: the global `fetch`. */
  fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function required(value: string | undefined, option: string, env: string): string {
  if (value === undefined || value === "") {
    throw new ConfigurationError(
      `Missing ${option}: pass the "${option}" option or set the ${env} environment variable`
    );
  }
  return value;
}

function resolveEnvironment(value: string | undefined): Environment {
  const env = value ?? "sandbox";
  if (env !== "sandbox" && env !== "production") {
    throw new ConfigurationError(
      `Invalid environment "${env}": use "sandbox" or "production"`
    );
  }
  return env;
}

function resolveBaseUrl(value: string | undefined, environment: Environment): string {
  if (value === undefined) return BASE_URLS[environment];
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError(`Invalid baseUrl: not a URL`);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new ConfigurationError(
      "baseUrl must use https:// (http:// is allowed only for localhost)"
    );
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new ConfigurationError(
      "baseUrl must not contain credentials, a query or a fragment"
    );
  }
  return url.toString().replace(/\/+$/, "");
}

/**
 * Nomba API client.
 *
 * ```ts
 * const nomba = new Nomba(); // reads NOMBA_CLIENT_ID, NOMBA_CLIENT_SECRET, NOMBA_ACCOUNT_ID
 * const balance = await nomba.accounts.getBalance();
 * ```
 */
export class Nomba {
  /** Webhook verification without a client: `Nomba.webhooks.verify(rawBody, headers, key)`. */
  static readonly webhooks = webhooks;
  static readonly VERSION = VERSION;

  readonly environment: Environment;
  readonly baseUrl: string;
  readonly accountId: string;

  readonly auth: AuthResource;
  readonly accounts: Accounts;
  readonly virtualAccounts: VirtualAccounts;
  readonly checkout: Checkout;
  readonly transfers: Transfers;
  readonly transactions: Transactions;
  readonly terminals: Terminals;
  readonly directDebits: DirectDebits;
  readonly bills: Bills;
  readonly globalPayout: GlobalPayout;
  readonly globalCollection: GlobalCollection;
  readonly webhooks = webhooks;

  readonly #clientId: string;

  constructor(options: NombaOptions = {}) {
    const clientId = required(
      options.clientId ?? readEnv("NOMBA_CLIENT_ID"),
      "clientId",
      "NOMBA_CLIENT_ID"
    );
    const clientSecret = required(
      options.clientSecret ?? readEnv("NOMBA_CLIENT_SECRET"),
      "clientSecret",
      "NOMBA_CLIENT_SECRET"
    );
    this.accountId = required(
      options.accountId ?? readEnv("NOMBA_ACCOUNT_ID"),
      "accountId",
      "NOMBA_ACCOUNT_ID"
    );
    this.environment = resolveEnvironment(
      options.environment ?? readEnv("NOMBA_ENVIRONMENT")
    );
    this.baseUrl = resolveBaseUrl(options.baseUrl, this.environment);
    this.#clientId = clientId;

    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
      throw new ConfigurationError("timeout must be a positive number of milliseconds");
    }
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new ConfigurationError("maxRetries must be a non-negative integer");
    }
    const fetchImpl = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (typeof fetchImpl !== "function") {
      throw new ConfigurationError(
        "No fetch implementation: use Node 18+ or pass the fetch option"
      );
    }

    const http = new HttpClient({
      baseUrl: this.baseUrl,
      accountId: this.accountId,
      timeout,
      maxRetries,
      fetch: fetchImpl,
      userAgent: `nomba-node/${VERSION} ${runtimeVersion()}`,
    });
    const tokens = new TokenManager({
      store: options.tokenStore ?? new InMemoryTokenStore(),
      issue: () =>
        http.request<TokenResponse>({
          method: "POST",
          path: "/v1/auth/token/issue",
          body: {
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
          },
          token: "obtain",
        }),
      refresh: (refreshToken) =>
        http.request<TokenResponse>({
          method: "POST",
          path: "/v1/auth/token/refresh",
          body: { grant_type: "refresh_token", refresh_token: refreshToken },
          token: "obtain",
        }),
    });
    http.setTokenManager(tokens);

    const ctx: ResourceContext = { http, environment: this.environment };
    this.auth = new AuthResource(ctx, tokens, clientId);
    this.accounts = new Accounts(ctx);
    this.virtualAccounts = new VirtualAccounts(ctx);
    this.checkout = new Checkout(ctx);
    this.transfers = new Transfers(ctx);
    this.transactions = new Transactions(ctx);
    this.terminals = new Terminals(ctx);
    this.directDebits = new DirectDebits(ctx);
    this.bills = new Bills(ctx);
    this.globalPayout = new GlobalPayout(ctx);
    this.globalCollection = new GlobalCollection(ctx);
  }

  /** Safe summary: never includes the client secret or tokens. */
  toJSON(): Record<string, string> {
    return {
      clientId: this.#clientId,
      accountId: this.accountId,
      environment: this.environment,
      baseUrl: this.baseUrl,
    };
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `Nomba ${JSON.stringify(this.toJSON())}`;
  }
}
