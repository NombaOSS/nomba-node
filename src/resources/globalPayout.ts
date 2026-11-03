import type {
  AuthorizeExchangeParams,
  AuthorizeExchangeResult,
  AuthorizeTransferParams,
  AuthorizeTransferResult,
  ConvertMoneyParams,
  ConvertMoneyResult,
  ExchangeRates,
  GetExchangeRatesParams,
  GlobalPayoutAccount,
  GlobalPayoutTransaction,
  ListBankProvidersParams,
  ListPaymentMethodsParams,
  PaymentMethod,
  Provider,
} from "../types.js";
import { requireFields } from "../internal/utils.js";
import { Resource, seg } from "./base.js";

/** Cross-border payouts. The sandbox uses separate paths for the account methods. */
export class GlobalPayout extends Resource {
  #accountsPath(): string {
    return this.ctx.environment === "sandbox"
      ? "/v1/sandbox/global-payout/accounts"
      : "/v1/global-payout/accounts";
  }

  async listAccounts(): Promise<GlobalPayoutAccount[]> {
    return this.request({ method: "GET", path: this.#accountsPath() });
  }

  async getAccount(accountId: string): Promise<GlobalPayoutAccount> {
    return this.request({
      method: "GET",
      path: `${this.#accountsPath()}/${seg(accountId, "accountId")}`,
    });
  }

  async listBankProviders(params: ListBankProvidersParams = {}): Promise<Provider[]> {
    return this.request({
      method: "GET",
      path: "/v1/global-payout/bank/providers",
      query: { ...params },
    });
  }

  async getExchangeRates(params: GetExchangeRatesParams): Promise<ExchangeRates> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["from", "to"],
      "globalPayout.getExchangeRates"
    );
    return this.request({
      method: "GET",
      path: "/v1/global-payout/exchange-rates",
      query: { ...params },
    });
  }

  async listPaymentMethods(
    params: ListPaymentMethodsParams = {}
  ): Promise<PaymentMethod[]> {
    return this.request({
      method: "GET",
      path: "/v1/global-payout/payment-methods",
      query: { ...params },
    });
  }

  async getTransaction(transactionId: string): Promise<GlobalPayoutTransaction> {
    return this.request({
      method: "GET",
      path: `/v1/global-payout/transactions/${seg(transactionId, "transactionId")}`,
    });
  }

  /** Never retried automatically; pass an `idempotencyKey` and reuse it when retrying. */
  async authorizeExchange(
    params: AuthorizeExchangeParams
  ): Promise<AuthorizeExchangeResult> {
    return this.request({
      method: "POST",
      path: "/v1/global-payout/exchange/authorize",
      body: params,
    });
  }

  async convertMoney(params: ConvertMoneyParams): Promise<ConvertMoneyResult> {
    return this.request({
      method: "POST",
      path: "/v1/global-payout/money/convert",
      body: params,
    });
  }

  /** Never retried automatically; pass an `idempotencyKey` and reuse it when retrying. */
  async authorizeTransfer(
    params: AuthorizeTransferParams
  ): Promise<AuthorizeTransferResult> {
    return this.request({
      method: "POST",
      path: "/v1/global-payout/transfer/authorize",
      body: params,
    });
  }
}
