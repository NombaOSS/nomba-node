import { ApiError } from "./errors.js";

/** An access token as kept by a {@link TokenStore}. */
export interface Token {
  accessToken: string;
  refreshToken: string;
  /** RFC 3339 expiry time from Nomba's `expiresAt`. */
  expiresAt: string;
}

/**
 * Where the client keeps its access token. The default keeps it in memory.
 * Implement this (e.g. over Redis) so several instances share one token:
 * Nomba recommends a single authenticating instance.
 */
export interface TokenStore {
  get(): Token | null | Promise<Token | null>;
  set(token: Token | null): void | Promise<void>;
}

/** Default token store: one token per client, held in memory. */
export class InMemoryTokenStore implements TokenStore {
  #token: Token | null = null;

  get(): Token | null {
    return this.#token;
  }

  set(token: Token | null): void {
    this.#token = token;
  }

  toJSON(): Record<string, string> {
    return { tokenStore: "InMemoryTokenStore" };
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "InMemoryTokenStore {}";
  }
}

/** Refresh when within this long of `expiresAt`. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** Used when `expiresAt` is missing or unparseable. Nomba tokens last about 30 minutes. */
const FALLBACK_LIFETIME_MS = 30 * 60 * 1000;

export interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expiresAt?: unknown;
}

export interface TokenManagerDeps {
  store: TokenStore;
  issue(): Promise<TokenResponse>;
  refresh(refreshToken: string): Promise<TokenResponse>;
  now?: () => number;
}

/**
 * Lazily obtains tokens, refreshes them before they expire and makes sure
 * concurrent callers share a single in-flight token request.
 */
export class TokenManager {
  readonly #deps: TokenManagerDeps;
  #inflight: Promise<string> | null = null;

  constructor(deps: TokenManagerDeps) {
    this.#deps = deps;
  }

  #now(): number {
    return this.#deps.now ? this.#deps.now() : Date.now();
  }

  /** Current access token, obtaining or refreshing one if needed. */
  async getAccessToken(): Promise<string> {
    if (this.#inflight) return this.#inflight;
    const cached = await this.#deps.store.get();
    if (cached && this.#expiryMs(cached) - this.#now() > REFRESH_MARGIN_MS) {
      return cached.accessToken;
    }
    // Re-check: another caller may have started a request while we awaited the store.
    if (this.#inflight) return this.#inflight;
    this.#inflight = this.#obtain(cached).finally(() => {
      this.#inflight = null;
    });
    return this.#inflight;
  }

  /** Drop the cached token, but only if it is still the one that failed. */
  async invalidate(failedAccessToken: string): Promise<void> {
    const cached = await this.#deps.store.get();
    if (cached && cached.accessToken === failedAccessToken) {
      await this.#deps.store.set(null);
    }
  }

  async current(): Promise<Token | null> {
    return this.#deps.store.get();
  }

  async clear(): Promise<void> {
    await this.#deps.store.set(null);
  }

  async #obtain(cached: Token | null): Promise<string> {
    if (cached?.refreshToken) {
      try {
        return await this.#save(await this.#deps.refresh(cached.refreshToken));
      } catch (err) {
        const status = err instanceof ApiError ? err.httpStatus : null;
        const clientError = status !== null && status >= 400 && status < 500;
        const nonSuccessCode = err instanceof ApiError && status !== null && status < 300;
        if (!clientError && !nonSuccessCode) {
          // Network/5xx trouble: keep using a token that has not actually expired.
          if (this.#expiryMs(cached) > this.#now()) return cached.accessToken;
          throw err;
        }
        // Refresh token rejected: fall back to a fresh issue.
      }
    }
    return this.#save(await this.#deps.issue());
  }

  async #save(res: TokenResponse): Promise<string> {
    const accessToken = typeof res.access_token === "string" ? res.access_token : "";
    if (!accessToken) {
      throw new ApiError(
        {
          httpStatus: 200,
          description: "token response did not include an access_token",
        },
        "Nomba API error: token response did not include an access_token"
      );
    }
    let expiresAt = typeof res.expiresAt === "string" ? res.expiresAt : "";
    if (Number.isNaN(Date.parse(expiresAt))) {
      expiresAt = new Date(this.#now() + FALLBACK_LIFETIME_MS).toISOString();
    }
    await this.#deps.store.set({
      accessToken,
      refreshToken: typeof res.refresh_token === "string" ? res.refresh_token : "",
      expiresAt,
    });
    return accessToken;
  }

  #expiryMs(token: Token): number {
    const t = Date.parse(token.expiresAt);
    return Number.isNaN(t) ? 0 : t;
  }
}
