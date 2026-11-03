import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationError,
  ConnectionError,
  InMemoryTokenStore,
  ServerError,
  type Token,
  type TokenStore,
} from "../src/index.js";
import { TokenManager } from "../src/auth.js";
import { timing } from "../src/internal/utils.js";
import { apiError, client, FAKE, json, MockApi, ok, tokenData } from "./helpers.js";

beforeEach(() => {
  vi.spyOn(timing, "sleep").mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

const MIN = 60 * 1000;

function storeWith(token: Token | null): TokenStore & { value: Token | null } {
  return {
    value: token,
    get() {
      return this.value;
    },
    set(t) {
      this.value = t;
    },
  };
}

describe("authentication", () => {
  it("issues a token lazily on first call with the right request", async () => {
    const m = new MockApi().on("GET", "/v1/accounts/parent", ok({ accountId: "p" }));
    const nomba = client(m);
    expect(m.calls).toHaveLength(0);
    await nomba.accounts.getParent();
    const issue = m.calls[0]!;
    expect(issue.method).toBe("POST");
    expect(issue.url.toString()).toBe("https://sandbox.nomba.com/v1/auth/token/issue");
    expect(issue.headers.accountId).toBe(FAKE.accountId);
    expect(issue.headers.Authorization).toBeUndefined();
    expect(issue.body).toEqual({
      grant_type: "client_credentials",
      client_id: FAKE.clientId,
      client_secret: FAKE.clientSecret,
    });
    expect(m.calls[1]!.headers.Authorization).toBe("Bearer test-access-token-1");
  });

  it("reuses a valid cached token", async () => {
    const m = new MockApi().on("GET", "/v1/accounts/parent", ok({}), ok({}), ok({}));
    const nomba = client(m);
    await nomba.accounts.getParent();
    await nomba.accounts.getParent();
    await nomba.accounts.getParent();
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(1);
  });

  it("refreshes when within 5 minutes of expiry", async () => {
    const store = storeWith({
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: new Date(Date.now() + 4 * MIN).toISOString(),
    });
    const m = new MockApi()
      .on("POST", "/v1/auth/token/refresh", ok(tokenData(7)))
      .on("GET", "/v1/accounts/parent", ok({}));
    await client(m, { tokenStore: store }).accounts.getParent();
    const refresh = m.callsTo("POST", "/v1/auth/token/refresh")[0]!;
    expect(refresh.body).toEqual({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
    });
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(0);
    expect(m.apiCalls[0]!.headers.Authorization).toBe("Bearer test-access-token-7");
    expect(store.value?.accessToken).toBe("test-access-token-7");
    expect(store.value?.refreshToken).toBe("test-refresh-token-7");
  });

  it("does not refresh a token with more than 5 minutes left", async () => {
    const store = storeWith({
      accessToken: "fresh",
      refreshToken: "r",
      expiresAt: new Date(Date.now() + 6 * MIN).toISOString(),
    });
    const m = new MockApi().on("GET", "/v1/accounts/parent", ok({}));
    await client(m, { tokenStore: store }).accounts.getParent();
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]!.headers.Authorization).toBe("Bearer fresh");
  });

  it("falls back to issue when refresh fails with 4xx", async () => {
    const store = storeWith({
      accessToken: "old",
      refreshToken: "bad-refresh",
      expiresAt: new Date(Date.now() - MIN).toISOString(),
    });
    const m = new MockApi()
      .on("POST", "/v1/auth/token/refresh", apiError(400, "invalid refresh token"))
      .on("GET", "/v1/accounts/parent", ok({}));
    await client(m, { tokenStore: store }).accounts.getParent();
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(1);
    expect(m.apiCalls[0]!.headers.Authorization).toBe("Bearer test-access-token-1");
  });

  it("falls back to issue when refresh returns a non-success code", async () => {
    const store = storeWith({
      accessToken: "old",
      refreshToken: "r",
      expiresAt: new Date(Date.now() - MIN).toISOString(),
    });
    const m = new MockApi()
      .on("POST", "/v1/auth/token/refresh", json({ code: "99", description: "nope" }))
      .on("GET", "/v1/accounts/parent", ok({}));
    await client(m, { tokenStore: store }).accounts.getParent();
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(1);
  });

  it("keeps a not-yet-expired token when refresh hits a network error", async () => {
    const store = storeWith({
      accessToken: "still-valid",
      refreshToken: "r",
      expiresAt: new Date(Date.now() + 2 * MIN).toISOString(),
    });
    const m = new MockApi()
      .on(
        "POST",
        "/v1/auth/token/refresh",
        new TypeError("fetch failed"),
        new TypeError("x"),
        new TypeError("y")
      )
      .on("GET", "/v1/accounts/parent", ok({}));
    await client(m, { tokenStore: store }).accounts.getParent();
    expect(m.apiCalls[0]!.headers.Authorization).toBe("Bearer still-valid");
    expect(m.callsTo("POST", "/v1/auth/token/refresh")).toHaveLength(3);
  });

  it("throws when refresh hits a 5xx and the token has expired", async () => {
    const store = storeWith({
      accessToken: "expired",
      refreshToken: "r",
      expiresAt: new Date(Date.now() - MIN).toISOString(),
    });
    const m = new MockApi().on(
      "POST",
      "/v1/auth/token/refresh",
      apiError(503),
      apiError(503),
      apiError(503)
    );
    await expect(
      client(m, { tokenStore: store }).accounts.getParent()
    ).rejects.toBeInstanceOf(ServerError);
  });

  it("shares one in-flight token request between concurrent calls", async () => {
    const m = new MockApi();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    m.autoIssue = false;
    m.on("POST", "/v1/auth/token/issue", async () => {
      await gate;
      return ok(tokenData(1));
    });
    for (let i = 0; i < 5; i++) m.on("GET", "/v1/accounts/parent", ok({ i }));
    const nomba = client(m);
    const all = Promise.all(Array.from({ length: 5 }, () => nomba.accounts.getParent()));
    await new Promise((r) => setTimeout(r, 5));
    release();
    await all;
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(1);
    expect(
      m.apiCalls.every((c) => c.headers.Authorization === "Bearer test-access-token-1")
    ).toBe(true);
  });

  it("works with an async token store", async () => {
    let saved: Token | null = null;
    const store: TokenStore = {
      get: async () => saved,
      set: async (t) => {
        saved = t;
      },
    };
    const m = new MockApi().on("GET", "/v1/accounts/parent", ok({}), ok({}));
    const nomba = client(m, { tokenStore: store });
    await nomba.accounts.getParent();
    await nomba.accounts.getParent();
    expect(saved).toMatchObject({ accessToken: "test-access-token-1" });
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(1);
  });

  it("on 401 re-authenticates and retries the original request once, even for POST", async () => {
    const m = new MockApi().on(
      "POST",
      "/v1/transfers/bank/lookup",
      apiError(401, "token expired"),
      ok({ accountName: "JOHN DOE" })
    );
    const res = await client(m).transfers.lookupAccount({
      accountNumber: "0123456789",
      bankCode: "058",
    });
    expect(res.accountName).toBe("JOHN DOE");
    const lookups = m.callsTo("POST", "/v1/transfers/bank/lookup");
    expect(lookups).toHaveLength(2);
    expect(lookups[0]!.headers.Authorization).toBe("Bearer test-access-token-1");
    expect(lookups[1]!.headers.Authorization).toBe("Bearer test-access-token-2");
  });

  it("throws AuthenticationError if the retry also gets 401", async () => {
    const m = new MockApi().on(
      "GET",
      "/v1/accounts/parent",
      apiError(401, "nope"),
      apiError(401, "still nope")
    );
    const err = await client(m)
      .accounts.getParent()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect((err as AuthenticationError).httpStatus).toBe(401);
    expect(m.callsTo("GET", "/v1/accounts/parent")).toHaveLength(2);
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(2);
  });

  it("only invalidates the token that failed", async () => {
    const store = new InMemoryTokenStore();
    const manager = new TokenManager({
      store,
      issue: async () => tokenData(1),
      refresh: async () => tokenData(2),
    });
    store.set({
      accessToken: "newer",
      refreshToken: "r",
      expiresAt: new Date(Date.now() + 30 * MIN).toISOString(),
    });
    // Another instance already replaced the token that failed: keep the newer one.
    await manager.invalidate("stale");
    expect(store.get()?.accessToken).toBe("newer");
    await manager.invalidate("newer");
    expect(store.get()).toBeNull();
  });

  it("raises AuthenticationError when token issue is rejected", async () => {
    const m = new MockApi();
    m.autoIssue = false;
    m.on("POST", "/v1/auth/token/issue", apiError(400, "invalid client credentials"));
    const err = await client(m)
      .accounts.getParent()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(String(err)).toContain("invalid client credentials");
    expect(String(err)).not.toContain(FAKE.clientSecret);
    expect(m.calls).toHaveLength(1);
  });

  it("raises AuthenticationError when token issue returns a non-success code", async () => {
    const m = new MockApi();
    m.autoIssue = false;
    m.on(
      "POST",
      "/v1/auth/token/issue",
      json({ code: "401", description: "bad", data: { access_token: "leak" } })
    );
    const err = (await client(m)
      .accounts.getParent()
      .catch((e: unknown) => e)) as AuthenticationError;
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(JSON.stringify(err.body)).not.toContain("leak");
  });

  it("retries token issue on 5xx and connection errors", async () => {
    const m = new MockApi();
    m.autoIssue = false;
    m.on(
      "POST",
      "/v1/auth/token/issue",
      apiError(502),
      new TypeError("fetch failed"),
      ok(tokenData(3))
    );
    m.on("GET", "/v1/accounts/parent", ok({}));
    await client(m).accounts.getParent();
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(3);
  });

  it("surfaces ConnectionError when token issue cannot connect", async () => {
    const m = new MockApi();
    m.autoIssue = false;
    m.on(
      "POST",
      "/v1/auth/token/issue",
      new TypeError("a"),
      new TypeError("b"),
      new TypeError("c")
    );
    await expect(client(m).accounts.getParent()).rejects.toBeInstanceOf(ConnectionError);
  });

  it("rejects a token response without an access_token", async () => {
    const m = new MockApi();
    m.autoIssue = false;
    m.on("POST", "/v1/auth/token/issue", ok({ refresh_token: "r" }));
    await expect(client(m).accounts.getParent()).rejects.toThrow(/access_token/);
  });

  it("assumes a 30 minute lifetime when expiresAt is unparseable", async () => {
    const store = new InMemoryTokenStore();
    const m = new MockApi();
    m.autoIssue = false;
    m.on(
      "POST",
      "/v1/auth/token/issue",
      ok({ access_token: "a", refresh_token: "r", expiresAt: "soon" })
    );
    m.on("GET", "/v1/accounts/parent", ok({}), ok({}));
    const nomba = client(m, { tokenStore: store });
    await nomba.accounts.getParent();
    await nomba.accounts.getParent();
    const exp = Date.parse(store.get()!.expiresAt);
    expect(exp - Date.now()).toBeGreaterThan(29 * MIN);
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(1);
  });

  it("treats a stored token with a bad expiresAt as expired", async () => {
    const store = storeWith({ accessToken: "a", refreshToken: "", expiresAt: "garbage" });
    const m = new MockApi().on("GET", "/v1/accounts/parent", ok({}));
    await client(m, { tokenStore: store }).accounts.getParent();
    expect(m.callsTo("POST", "/v1/auth/token/issue")).toHaveLength(1);
  });

  it("revoke posts clientId + access_token and clears the store", async () => {
    const store = new InMemoryTokenStore();
    const m = new MockApi()
      .on("GET", "/v1/accounts/parent", ok({}))
      .on("POST", "/v1/auth/token/revoke", json({ code: "00", description: "revoked" }));
    const nomba = client(m, { tokenStore: store });
    await nomba.accounts.getParent();
    await expect(nomba.auth.revoke()).resolves.toBeNull();
    const call = m.callsTo("POST", "/v1/auth/token/revoke")[0]!;
    expect(call.body).toEqual({
      clientId: FAKE.clientId,
      access_token: "test-access-token-1",
    });
    expect(call.headers.Authorization).toBe("Bearer test-access-token-1");
    expect(store.get()).toBeNull();
  });

  it("revoke clears the store even when the request fails", async () => {
    const store = new InMemoryTokenStore();
    const m = new MockApi()
      .on("GET", "/v1/accounts/parent", ok({}))
      .on("POST", "/v1/auth/token/revoke", apiError(500));
    const nomba = client(m, { tokenStore: store });
    await nomba.accounts.getParent();
    await expect(nomba.auth.revoke()).rejects.toBeInstanceOf(ServerError);
    expect(store.get()).toBeNull();
    expect(m.callsTo("POST", "/v1/auth/token/revoke")).toHaveLength(1);
  });

  it("revoke with no cached token makes no request", async () => {
    const m = new MockApi();
    await expect(client(m).auth.revoke()).resolves.toBeNull();
    expect(m.calls).toHaveLength(0);
  });

  it("the default token store does not reveal its token", () => {
    const store = new InMemoryTokenStore();
    store.set({ accessToken: "secret-a", refreshToken: "secret-r", expiresAt: "x" });
    expect(JSON.stringify(store)).not.toContain("secret");
    expect(Object.keys(store)).toHaveLength(0);
  });
});
