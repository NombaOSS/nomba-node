import type { TokenManager } from "../auth.js";
import type { RevokeTokenResult } from "../types.js";
import { Resource, type ResourceContext } from "./base.js";

export class AuthResource extends Resource {
  readonly #tokens: TokenManager;
  readonly #clientId: string;

  constructor(ctx: ResourceContext, tokens: TokenManager, clientId: string) {
    super(ctx);
    this.#tokens = tokens;
    this.#clientId = clientId;
  }

  /**
   * Revoke the cached access token (`POST /v1/auth/token/revoke`) and clear the
   * token store. Does nothing and returns `null` when no token is cached.
   */
  async revoke(): Promise<RevokeTokenResult | null> {
    const token = await this.#tokens.current();
    if (!token) return null;
    try {
      return await this.request<RevokeTokenResult | null>({
        method: "POST",
        path: "/v1/auth/token/revoke",
        body: { clientId: this.#clientId, access_token: token.accessToken },
      });
    } finally {
      await this.#tokens.clear();
    }
  }
}
