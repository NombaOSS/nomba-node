import { requireFields } from "../internal/utils.js";
import type {
  AccountLookupResult,
  Bank,
  BankTransferParams,
  BankTransferResult,
  LookupAccountParams,
  SubAccountOption,
  WalletTransferParams,
  WalletTransferResult,
} from "../types.js";
import { Resource } from "./base.js";

export class Transfers extends Resource {
  /** Bank codes and names. */
  async listBanks(): Promise<Bank[]> {
    return this.request({ method: "GET", path: "/v1/transfers/banks" });
  }

  /** Resolve the account name for an account number and bank code. */
  async lookupAccount(params: LookupAccountParams): Promise<AccountLookupResult> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["accountNumber", "bankCode"],
      "transfers.lookupAccount"
    );
    return this.request({
      method: "POST",
      path: "/v1/transfers/bank/lookup",
      body: { accountNumber: params.accountNumber, bankCode: params.bankCode },
    });
  }

  /**
   * Transfer to a bank account. Never retried automatically. Pass your own
   * `merchantTxRef` (or keep the generated one from the result) to requery.
   */
  async toBank(
    params: BankTransferParams,
    options: SubAccountOption = {}
  ): Promise<BankTransferResult> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["amount", "accountNumber", "accountName", "bankCode"],
      "transfers.toBank"
    );
    return this.withMerchantTxRef(
      this.withSubAccount("/v2/transfers/bank", options.subAccountId),
      params
    );
  }

  /** Transfer to another Nomba wallet. Never retried automatically. */
  async toWallet(
    params: WalletTransferParams,
    options: SubAccountOption = {}
  ): Promise<WalletTransferResult> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["amount", "receiverAccountId"],
      "transfers.toWallet"
    );
    return this.withMerchantTxRef(
      this.withSubAccount("/v2/transfers/wallet", options.subAccountId),
      params
    );
  }
}
