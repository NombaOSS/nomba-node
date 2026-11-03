import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/index.js";
import { client, MockApi, ok } from "./helpers.js";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe("auto-pagination", () => {
  it("transactions.listAll follows cursors until the last page", async () => {
    const m = new MockApi().on(
      "GET",
      "/v1/transactions/accounts",
      ok({ results: [{ id: "1" }, { id: "2" }], cursor: "c1" }),
      ok({ results: [{ id: "3" }], cursor: "c2" }),
      ok({ results: [{ id: "4" }], cursor: "" })
    );
    const items = await collect(
      client(m).transactions.listAll({ limit: 2, dateFrom: "2025-01-01" })
    );
    expect(items.map((t) => t.id)).toEqual(["1", "2", "3", "4"]);
    const calls = m.apiCalls;
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url.searchParams.get("cursor")).toBeNull();
    expect(calls[1]!.url.searchParams.get("cursor")).toBe("c1");
    expect(calls[2]!.url.searchParams.get("cursor")).toBe("c2");
    expect(calls.every((c) => c.url.searchParams.get("limit") === "2")).toBe(true);
    expect(calls.every((c) => c.url.searchParams.get("dateFrom") === "2025-01-01")).toBe(
      true
    );
  });

  it("stops on an absent cursor, an empty page or a repeated cursor", async () => {
    const m = new MockApi()
      .on("GET", "/v1/transactions/bank", ok({ results: [{ amount: 1 }] }))
      .on("GET", "/v1/accounts/terminals", ok({ results: [], cursor: "more" }))
      .on(
        "POST",
        "/v1/transactions/accounts",
        ok({ results: [{ id: "a" }], cursor: "same" }),
        ok({ results: [{ id: "b" }], cursor: "same" })
      );
    const n = client(m);
    expect(await collect(n.transactions.listAllBankTransactions())).toHaveLength(1);
    expect(await collect(n.accounts.listAllTerminals())).toHaveLength(0);
    expect(
      (await collect(n.transactions.filterAll({ status: "SUCCESS" }))).map((t) => t.id)
    ).toEqual(["a", "b"]);
    expect(m.callsTo("POST", "/v1/transactions/accounts")).toHaveLength(2);
    expect(m.callsTo("POST", "/v1/transactions/accounts")[0]!.body).toEqual({
      status: "SUCCESS",
    });
  });

  it("handles a null page", async () => {
    const m = new MockApi().on("GET", "/v1/transactions/accounts", ok(null));
    expect(await collect(client(m).transactions.listAll())).toEqual([]);
  });

  it("virtualAccounts.listAll and sub-account terminals page too", async () => {
    const m = new MockApi()
      .on(
        "POST",
        "/v1/accounts/virtual/list",
        ok({ results: [{ accountRef: "a" }], cursor: "n" }),
        ok({ results: [{ accountRef: "b" }] })
      )
      .on("GET", "/v1/accounts/s1/terminals", ok({ results: [{ terminalId: "t" }] }));
    const n = client(m);
    expect(
      (await collect(n.virtualAccounts.listAll({ expired: false }, { limit: 50 }))).map(
        (v) => v.accountRef
      )
    ).toEqual(["a", "b"]);
    expect(
      m.callsTo("POST", "/v1/accounts/virtual/list")[1]!.url.searchParams.get("cursor")
    ).toBe("n");
    expect(
      await collect(n.accounts.listAllTerminals({ subAccountId: "s1" }))
    ).toHaveLength(1);
  });

  it("can stop early without fetching more pages", async () => {
    const m = new MockApi().on(
      "GET",
      "/v1/transactions/accounts",
      ok({ results: [{ id: "1" }, { id: "2" }], cursor: "c1" })
    );
    for await (const tx of client(m).transactions.listAll()) {
      expect(tx.id).toBe("1");
      break;
    }
    expect(m.apiCalls).toHaveLength(1);
  });

  it("validates limit when iteration starts", async () => {
    const n = client(new MockApi());
    await expect(collect(n.transactions.listAll({ limit: 100 }))).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      collect(n.transactions.filterAll({}, { limit: 100 }))
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      collect(n.transactions.listAllBankTransactions({ limit: 100 }))
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      collect(n.accounts.listAllTerminals({ limit: 100 }))
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      collect(n.virtualAccounts.listAll({}, { limit: 100 }))
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
