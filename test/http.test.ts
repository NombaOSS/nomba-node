import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import {
  ApiError,
  AuthenticationError,
  ConnectionError,
  NombaError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from "../src/index.js";
import { backoffMs, parseRetryAfter } from "../src/internal/http.js";
import { timing } from "../src/internal/utils.js";
import { apiError, client, FAKE, json, MockApi, ok } from "./helpers.js";

let sleep: MockInstance<(ms: number) => Promise<void>>;
beforeEach(() => {
  sleep = vi.spyOn(timing, "sleep").mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("envelope", () => {
  it.each(["00", "200", "201", 200])(
    "treats code %s as success and returns data only",
    async (code) => {
      const m = new MockApi().on(
        "GET",
        "/v1/accounts/parent",
        json({ code, description: "ok", data: { x: 1 } })
      );
      await expect(client(m).accounts.getParent()).resolves.toEqual({ x: 1 });
    }
  );

  it("treats an absent code as success", async () => {
    const m = new MockApi().on("GET", "/v1/accounts/parent", json({ data: { x: 2 } }));
    await expect(client(m).accounts.getParent()).resolves.toEqual({ x: 2 });
  });

  it("returns null for an envelope without data and for an empty body", async () => {
    const m = new MockApi()
      .on("GET", "/v1/accounts/parent", json({ code: "00", description: "ok" }))
      .on("GET", "/v1/accounts/balance", new Response("", { status: 200 }));
    const nomba = client(m);
    await expect(nomba.accounts.getParent()).resolves.toBeNull();
    await expect(nomba.accounts.getBalance()).resolves.toBeNull();
  });

  it("returns a non-envelope JSON body as-is", async () => {
    const m = new MockApi().on("GET", "/v1/transfers/banks", json([{ code: "058" }]));
    await expect(client(m).transfers.listBanks()).resolves.toEqual([{ code: "058" }]);
  });

  it("does not throw on data.status values like PENDING_BILLING or REFUND", async () => {
    const m = new MockApi().on(
      "POST",
      "/v2/transfers/bank",
      ok({ id: "t1", status: "REFUND" })
    );
    const res = await client(m).transfers.toBank({
      amount: 100,
      accountNumber: "0123456789",
      accountName: "JOHN DOE",
      bankCode: "058",
      merchantTxRef: "ref-1",
    });
    expect(res.status).toBe("REFUND");
  });

  it("throws ApiError for a 2xx with a non-success code", async () => {
    const m = new MockApi().on(
      "POST",
      "/v2/transfers/bank",
      json({ code: "99", description: "Insufficient balance", data: null })
    );
    const err = (await client(m)
      .transfers.toBank({
        amount: 1,
        accountNumber: "1",
        accountName: "A",
        bankCode: "1",
        merchantTxRef: "r",
      })
      .catch((e: unknown) => e)) as ApiError;
    expect(err.constructor).toBe(ApiError);
    expect(err.httpStatus).toBe(200);
    expect(err.code).toBe("99");
    expect(err.description).toBe("Insufficient balance");
    expect(err.message).toBe(
      'Nomba API error 200 (code "99"): Insufficient balance [POST /v2/transfers/bank]'
    );
  });

  it("throws ApiError for a 2xx body that is not JSON", async () => {
    const m = new MockApi().on(
      "GET",
      "/v1/accounts/parent",
      new Response("<html>", { status: 200 })
    );
    await expect(client(m).accounts.getParent()).rejects.toThrow(/not valid JSON/);
  });
});

describe("error classes", () => {
  it.each([
    [400, ValidationError],
    [422, ValidationError],
    [403, PermissionDeniedError],
    [404, NotFoundError],
    [409, ApiError],
  ] as const)("maps HTTP %i to %o", async (status, cls) => {
    const m = new MockApi().on("POST", "/v2/transfers/bank", apiError(status, "Problem"));
    const err = (await client(m)
      .transfers.toBank({
        amount: 1,
        accountNumber: "1",
        accountName: "A",
        bankCode: "1",
        merchantTxRef: "r",
      })
      .catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(cls);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(NombaError);
    expect(err.constructor).toBe(cls);
    expect(err.name).toBe(cls.name);
    expect(err.httpStatus).toBe(status);
    expect(err.code).toBe(String(status));
    expect(err.method).toBe("POST");
    expect(err.path).toBe("/v2/transfers/bank");
    expect(err.body).toEqual({ code: String(status), description: "Problem" });
    expect(err.message).toBe(
      `Nomba API error ${status} (code "${status}"): Problem [POST /v2/transfers/bank]`
    );
  });

  it("maps 5xx to ServerError and 401 to AuthenticationError", async () => {
    const m = new MockApi()
      .on("POST", "/v1/checkout/refund", apiError(500, "Downstream"))
      .on("POST", "/v1/checkout/order/cancel", apiError(401), apiError(401));
    const nomba = client(m);
    await expect(nomba.checkout.refund({ transactionId: "t" })).rejects.toBeInstanceOf(
      ServerError
    );
    await expect(
      nomba.checkout.cancelOrder({ orderReference: "o" })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("maps 429 to RateLimitError with Retry-After and rate-limit headers", async () => {
    const m = new MockApi().on(
      "POST",
      "/v1/checkout/refund",
      apiError(429, "Too many requests", {
        "Retry-After": "3",
        "X-Rate-Limit-Limit": "40",
        "X-Rate-Limit-Remaining": "0",
        "X-Rate-Limit-Window": "1s",
      })
    );
    const err = (await client(m)
      .checkout.refund({ transactionId: "t" })
      .catch((e: unknown) => e)) as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(3);
    expect(err.rateLimit).toEqual({ limit: "40", remaining: "0", window: "1s" });
  });

  it("uses message when description is absent, and omits the query string from the path", async () => {
    const m = new MockApi()
      .on("GET", "/v1/transactions/accounts/single", json({ message: "missing" }, 404))
      .on("GET", "/v1/transactions/accounts", new Response("", { status: 418 }));
    const nomba = client(m, { maxRetries: 0 });
    const err = (await nomba.transactions
      .get({ merchantTxRef: "secret-ish" })
      .catch((e: unknown) => e)) as ApiError;
    expect(err.description).toBe("missing");
    expect(err.code).toBeUndefined();
    expect(err.message).toBe(
      "Nomba API error 404: missing [GET /v1/transactions/accounts/single]"
    );
    expect(err.message).not.toContain("secret-ish");
    const err2 = (await nomba.transactions.list().catch((e: unknown) => e)) as ApiError;
    expect(err2.message).toBe(
      "Nomba API error 418: no description [GET /v1/transactions/accounts]"
    );
  });

  it("never includes credentials or tokens in errors", async () => {
    const m = new MockApi().on("GET", "/v1/accounts/parent", apiError(403, "Forbidden"));
    const err = await client(m)
      .accounts.getParent()
      .catch((e: unknown) => e);
    const dump =
      JSON.stringify(err) +
      String(err) +
      JSON.stringify(Object.getOwnPropertyDescriptors(err));
    expect(dump).not.toContain(FAKE.clientSecret);
    expect(dump).not.toContain("test-access-token");
    expect(dump).not.toContain("Bearer");
  });
});

describe("retries", () => {
  it("retries GET on 5xx with backoff, then succeeds", async () => {
    const m = new MockApi().on(
      "GET",
      "/v1/accounts/parent",
      apiError(503),
      apiError(500),
      ok({ ok: 1 })
    );
    await expect(client(m).accounts.getParent()).resolves.toEqual({ ok: 1 });
    expect(m.callsTo("GET", "/v1/accounts/parent")).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries", async () => {
    const m = new MockApi().on(
      "GET",
      "/v1/accounts/parent",
      apiError(503),
      apiError(503),
      apiError(503)
    );
    await expect(client(m).accounts.getParent()).rejects.toBeInstanceOf(ServerError);
    expect(m.callsTo("GET", "/v1/accounts/parent")).toHaveLength(3);
  });

  it("respects maxRetries: 0", async () => {
    const m = new MockApi().on("GET", "/v1/accounts/parent", apiError(503));
    await expect(
      client(m, { maxRetries: 0 }).accounts.getParent()
    ).rejects.toBeInstanceOf(ServerError);
    expect(m.callsTo("GET", "/v1/accounts/parent")).toHaveLength(1);
  });

  it("retries GET on 429, honouring Retry-After (capped at 60 s)", async () => {
    const m = new MockApi().on(
      "GET",
      "/v1/accounts/parent",
      apiError(429, "slow down", { "Retry-After": "2" }),
      apiError(429, "slow down", { "Retry-After": "600" }),
      ok({})
    );
    await client(m).accounts.getParent();
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenNthCalledWith(2, 60_000);
  });

  it("retries GET on connection errors, then throws ConnectionError", async () => {
    const m = new MockApi().on(
      "GET",
      "/v1/accounts/parent",
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed")
    );
    const err = (await client(m)
      .accounts.getParent()
      .catch((e: unknown) => e)) as ConnectionError;
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err).not.toBeInstanceOf(TimeoutError);
    expect(err.method).toBe("GET");
    expect(err.path).toBe("/v1/accounts/parent");
    expect(err.cause).toBeInstanceOf(TypeError);
    expect(m.callsTo("GET", "/v1/accounts/parent")).toHaveLength(3);
  });

  it.each([
    ["500", () => apiError(500)],
    ["503", () => apiError(503)],
    ["429", () => apiError(429, "x", { "Retry-After": "0" })],
    ["a connection error", () => new TypeError("fetch failed")],
  ])("never retries POST on %s", async (_label, make) => {
    const m = new MockApi().on("POST", "/v2/transfers/bank", make(), ok({}));
    await expect(
      client(m).transfers.toBank({
        amount: 1,
        accountNumber: "1",
        accountName: "A",
        bankCode: "1",
      })
    ).rejects.toBeInstanceOf(NombaError);
    expect(m.callsTo("POST", "/v2/transfers/bank")).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("never retries PUT or DELETE", async () => {
    const m = new MockApi()
      .on("PUT", "/v1/accounts/virtual/abc", apiError(502), ok({}))
      .on("DELETE", "/v1/accounts/virtual/abc", apiError(502), ok({}));
    const nomba = client(m);
    await expect(
      nomba.virtualAccounts.update("abc", { accountName: "x" })
    ).rejects.toBeInstanceOf(ServerError);
    await expect(nomba.virtualAccounts.expire("abc")).rejects.toBeInstanceOf(ServerError);
    expect(m.apiCalls).toHaveLength(2);
  });

  it("times out with TimeoutError", async () => {
    sleep.mockRestore();
    const m = new MockApi().on(
      "GET",
      "/v1/accounts/parent",
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          call.init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const err = (await client(m, { timeout: 10, maxRetries: 0 })
      .accounts.getParent()
      .catch((e: unknown) => e)) as TimeoutError;
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.message).toBe(
      "Nomba request timed out after 10 ms [GET /v1/accounts/parent]"
    );
  });

  it("backoff doubles from 0.5 s, caps at 8 s, and jitters downward", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map((a) => backoffMs(a, () => 0))).toEqual([
      500, 1000, 2000, 4000, 8000, 8000, 8000,
    ]);
    expect(backoffMs(0, () => 1)).toBe(375);
    expect(backoffMs(2)).toBeGreaterThanOrEqual(1500);
    expect(backoffMs(2)).toBeLessThanOrEqual(2000);
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter("5")).toBe(5);
    expect(parseRetryAfter("-5")).toBe(0);
    expect(parseRetryAfter("nonsense")).toBeUndefined();
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10);
  });
});

describe("request shape", () => {
  it("sends the standard headers, refuses redirects, and drops null query params", async () => {
    const m = new MockApi().on("GET", "/v1/global-payout/bank/providers", ok([]));
    await client(m).globalPayout.listBankProviders({
      isMobileMoney: false,
      countryIsoCode: undefined,
    });
    const call = m.apiCalls[0]!;
    expect(call.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      accountId: FAKE.accountId,
      Authorization: "Bearer test-access-token-1",
    });
    expect(call.init.redirect).toBe("error");
    expect(call.url.search).toBe("?isMobileMoney=false");
  });

  it("sends a JSON body with DELETE", async () => {
    const m = new MockApi().on(
      "DELETE",
      "/v1/checkout/tokenized-card-data",
      ok({ status: true })
    );
    await client(m).checkout.deleteSavedCard({ tokenKey: "tok_123" });
    expect(m.apiCalls[0]!.rawBody).toBe('{"tokenKey":"tok_123"}');
  });

  it("uses a custom baseUrl", async () => {
    const m = new MockApi().on("GET", "/proxy/v1/accounts/parent", ok({}));
    await client(m, { baseUrl: "http://localhost:4010/proxy" }).accounts.getParent();
    expect(m.apiCalls[0]!.url.toString()).toBe(
      "http://localhost:4010/proxy/v1/accounts/parent"
    );
  });
});
