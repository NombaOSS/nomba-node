import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import Nomba, { ConfigurationError, VERSION } from "../src/index.js";
import { client, FAKE, MockApi, ok } from "./helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  it("reads credentials and environment from env vars", () => {
    vi.stubEnv("NOMBA_CLIENT_ID", "env-id");
    vi.stubEnv("NOMBA_CLIENT_SECRET", "env-secret");
    vi.stubEnv("NOMBA_ACCOUNT_ID", "env-account");
    vi.stubEnv("NOMBA_ENVIRONMENT", "production");
    const nomba = new Nomba({ fetch: new MockApi().fetch as typeof fetch });
    expect(nomba.accountId).toBe("env-account");
    expect(nomba.environment).toBe("production");
    expect(nomba.baseUrl).toBe("https://api.nomba.com");
  });

  it("defaults to the sandbox", () => {
    vi.stubEnv("NOMBA_ENVIRONMENT", "");
    const nomba = client(new MockApi());
    expect(nomba.environment).toBe("sandbox");
    expect(nomba.baseUrl).toBe("https://sandbox.nomba.com");
  });

  it.each([
    ["clientId", "NOMBA_CLIENT_ID"],
    ["clientSecret", "NOMBA_CLIENT_SECRET"],
    ["accountId", "NOMBA_ACCOUNT_ID"],
  ])("names the missing %s option and %s env var", (option, env) => {
    vi.stubEnv(env, "");
    const opts: Record<string, unknown> = { ...FAKE, fetch: new MockApi().fetch };
    delete opts[option];
    expect(() => new Nomba(opts)).toThrow(ConfigurationError);
    expect(() => new Nomba(opts)).toThrow(new RegExp(`${option}.*${env}`));
  });

  it("rejects an unknown environment", () => {
    expect(() =>
      client(new MockApi(), { environment: "staging" as unknown as "sandbox" })
    ).toThrow(/Invalid environment "staging"/);
  });

  it("validates baseUrl", () => {
    const m = new MockApi();
    expect(client(m, { baseUrl: "https://proxy.example.com/nomba/" }).baseUrl).toBe(
      "https://proxy.example.com/nomba"
    );
    expect(client(m, { baseUrl: "http://localhost:8080" }).baseUrl).toBe(
      "http://localhost:8080"
    );
    expect(client(m, { baseUrl: "http://127.0.0.1:9" }).baseUrl).toBe(
      "http://127.0.0.1:9"
    );
    expect(() => client(m, { baseUrl: "http://example.com" })).toThrow(/https/);
    expect(() => client(m, { baseUrl: "ftp://localhost" })).toThrow(/https/);
    expect(() => client(m, { baseUrl: "not a url" })).toThrow(/not a URL/);
    expect(() => client(m, { baseUrl: "https://u:p@example.com" })).toThrow(
      /credentials/
    );
    expect(() => client(m, { baseUrl: "https://example.com/?x=1" })).toThrow(/query/);
  });

  it("validates timeout and maxRetries", () => {
    const m = new MockApi();
    expect(() => client(m, { timeout: 0 })).toThrow(/timeout/);
    expect(() => client(m, { timeout: Number.NaN })).toThrow(/timeout/);
    expect(() => client(m, { maxRetries: -1 })).toThrow(/maxRetries/);
    expect(() => client(m, { maxRetries: 1.5 })).toThrow(/maxRetries/);
  });

  it("requires a fetch implementation", () => {
    vi.stubGlobal("fetch", undefined);
    expect(() => new Nomba({ ...FAKE })).toThrow(/fetch/);
  });

  it("uses the global fetch by default", async () => {
    const m = new MockApi().on("GET", "/v1/accounts/parent", ok({ accountId: "a" }));
    vi.stubGlobal("fetch", m.fetch);
    const nomba = new Nomba({ ...FAKE });
    await expect(nomba.accounts.getParent()).resolves.toEqual({ accountId: "a" });
  });

  it("makes no network call in the constructor", () => {
    const m = new MockApi();
    client(m);
    expect(m.calls).toHaveLength(0);
  });

  it("never exposes the secret or tokens when logged or serialised", async () => {
    const m = new MockApi().on("GET", "/v1/accounts/parent", ok({}));
    const nomba = client(m);
    await nomba.accounts.getParent();
    const views = [
      JSON.stringify(nomba),
      inspect(nomba, { depth: 10, showHidden: true }),
      String(nomba),
    ];
    for (const view of views) {
      expect(view).not.toContain(FAKE.clientSecret);
      expect(view).not.toContain("test-access-token");
      expect(view).not.toContain("test-refresh-token");
    }
    expect(JSON.stringify(nomba)).toContain(FAKE.accountId);
    expect(Object.keys(nomba)).not.toContain("clientSecret");
  });

  it("sends the SDK user agent and VERSION matches package.json", async () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    );
    expect(VERSION).toBe(pkg.version);
    expect(Nomba.VERSION).toBe(VERSION);
    const m = new MockApi().on("GET", "/v1/accounts/parent", ok({}));
    await client(m).accounts.getParent();
    expect(m.calls[1]!.headers["User-Agent"]).toMatch(
      new RegExp(`^nomba-node/${VERSION.replace(/\./g, "\\.")} node/v\\d+`)
    );
  });
});
