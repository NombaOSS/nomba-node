import { autoPage } from "../internal/pagination.js";
import { requireExactlyOne, validateLimit } from "../internal/utils.js";
import type {
  BankTransaction,
  CursorPage,
  GetTransactionParams,
  ListBankTransactionsParams,
  ListTransactionsParams,
  Transaction,
  TransactionFilters,
} from "../types.js";
import { Resource, seg } from "./base.js";

const REFERENCE_KEYS = [
  "transactionRef",
  "merchantTxRef",
  "orderReference",
  "orderId",
] as const;

export class Transactions extends Resource {
  #accountsPath(subAccountId: string | undefined): string {
    return this.withSubAccount("/v1/transactions/accounts", subAccountId);
  }

  /** One page of transactions on the parent account or a sub account. */
  async list(params: ListTransactionsParams = {}): Promise<CursorPage<Transaction>> {
    const { subAccountId, ...query } = params;
    validateLimit(query.limit);
    return this.request({
      method: "GET",
      path: this.#accountsPath(subAccountId),
      query: { ...query },
    });
  }

  /** Every transaction, across pages: `for await (const tx of nomba.transactions.listAll())`. */
  async *listAll(
    params: Omit<ListTransactionsParams, "cursor"> = {}
  ): AsyncGenerator<Transaction> {
    validateLimit(params.limit);
    yield* autoPage((cursor) => this.list({ ...params, cursor }));
  }

  /** One page of transactions matching `filters`. */
  async filter(
    filters: TransactionFilters = {},
    params: ListTransactionsParams = {}
  ): Promise<CursorPage<Transaction>> {
    const { subAccountId, ...query } = params;
    validateLimit(query.limit);
    return this.request({
      method: "POST",
      path: this.#accountsPath(subAccountId),
      query: { ...query },
      body: filters,
    });
  }

  /** Every transaction matching `filters`, across pages. */
  async *filterAll(
    filters: TransactionFilters = {},
    params: Omit<ListTransactionsParams, "cursor"> = {}
  ): AsyncGenerator<Transaction> {
    validateLimit(params.limit);
    yield* autoPage((cursor) => this.filter(filters, { ...params, cursor }));
  }

  /** One transaction, by exactly one of `transactionRef`, `merchantTxRef`, `orderReference`, `orderId`. */
  async get(params: GetTransactionParams): Promise<Transaction> {
    requireExactlyOne(
      params as Record<string, unknown>,
      REFERENCE_KEYS,
      "transactions.get"
    );
    const { subAccountId, ...query } = params;
    const path =
      subAccountId === undefined
        ? "/v1/transactions/accounts/single"
        : `/v1/transactions/accounts/${seg(subAccountId, "subAccountId")}/single`;
    return this.request({ method: "GET", path, query: { ...query } });
  }

  /** One page of credits/debits on the parent account. */
  async listBankTransactions(
    params: ListBankTransactionsParams = {}
  ): Promise<CursorPage<BankTransaction>> {
    validateLimit(params.limit);
    return this.request({
      method: "GET",
      path: "/v1/transactions/bank",
      query: { ...params },
    });
  }

  /** Every credit/debit on the parent account, across pages. */
  async *listAllBankTransactions(
    params: Omit<ListBankTransactionsParams, "cursor"> = {}
  ): AsyncGenerator<BankTransaction> {
    validateLimit(params.limit);
    yield* autoPage((cursor) => this.listBankTransactions({ ...params, cursor }));
  }

  /** Confirm a transaction's status by its NIP `sessionId`. */
  async requery(sessionId: string): Promise<Transaction> {
    return this.request({
      method: "GET",
      path: `/v1/transactions/requery/${seg(sessionId, "sessionId")}`,
    });
  }
}
