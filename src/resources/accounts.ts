import { requireExactlyOne, validateLimit } from "../internal/utils.js";
import { autoPage } from "../internal/pagination.js";
import type {
  Account,
  Balance,
  CursorPage,
  GetBalanceParams,
  GetSubAccountParams,
  ListTerminalsParams,
  Terminal,
} from "../types.js";
import { Resource } from "./base.js";

export class Accounts extends Resource {
  /** Parent account details. `GET /v1/accounts/parent` */
  async getParent(): Promise<Account> {
    return this.request({ method: "GET", path: "/v1/accounts/parent" });
  }

  /** Balance of the parent account, or of a sub account. */
  async getBalance(params: GetBalanceParams = {}): Promise<Balance> {
    return this.request({
      method: "GET",
      path: this.withSubAccount("/v1/accounts", params.subAccountId, "/balance"),
    });
  }

  /** Sub account details by `accountId` or `accountRef` (exactly one). */
  async getSubAccount(params: GetSubAccountParams): Promise<Account> {
    requireExactlyOne(
      params as Record<string, unknown>,
      ["accountId", "accountRef"],
      "accounts.getSubAccount"
    );
    return this.request({
      method: "GET",
      path: "/v1/accounts/sub-account-details",
      query: { accountId: params.accountId, accountRef: params.accountRef },
    });
  }

  /** One page of terminals on the parent account or a sub account. */
  async listTerminals(params: ListTerminalsParams = {}): Promise<CursorPage<Terminal>> {
    const { subAccountId, ...query } = params;
    validateLimit(query.limit);
    return this.request({
      method: "GET",
      path: this.withSubAccount("/v1/accounts", subAccountId, "/terminals"),
      query: { ...query },
    });
  }

  /** Every terminal, across pages: `for await (const t of nomba.accounts.listAllTerminals())`. */
  async *listAllTerminals(
    params: Omit<ListTerminalsParams, "cursor"> = {}
  ): AsyncGenerator<Terminal> {
    validateLimit(params.limit);
    yield* autoPage((cursor) => this.listTerminals({ ...params, cursor }));
  }
}
