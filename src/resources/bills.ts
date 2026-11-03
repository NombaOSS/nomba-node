import { requireFields } from "../internal/utils.js";
import type {
  BettingProvider,
  BillPurchaseResult,
  BuyAirtimeParams,
  BuyDataParams,
  BuyElectricityParams,
  CableTvPlan,
  CableTvType,
  DataPlan,
  ElectricityCustomer,
  FundBettingParams,
  LookupBettingCustomerParams,
  LookupCableTvCustomerParams,
  LookupElectricityCustomerParams,
  PayCableTvParams,
  SubAccountOption,
} from "../types.js";
import { Resource, seg } from "./base.js";

/**
 * Bill payments. Purchases use the v2 endpoints, generate a `merchantTxRef` if
 * you don't pass one, and are never retried automatically.
 */
export class Bills extends Resource {
  async buyAirtime(
    params: BuyAirtimeParams,
    options: SubAccountOption = {}
  ): Promise<BillPurchaseResult> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["amount", "phoneNumber", "network"],
      "bills.buyAirtime"
    );
    return this.withMerchantTxRef(
      this.withSubAccount("/v2/bill/topup", options.subAccountId),
      params
    );
  }

  async buyData(
    params: BuyDataParams,
    options: SubAccountOption = {}
  ): Promise<BillPurchaseResult> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["productId", "phoneNumber", "network"],
      "bills.buyData"
    );
    return this.withMerchantTxRef(
      this.withSubAccount("/v2/bill/data", options.subAccountId),
      params
    );
  }

  /** Data plans for a telco (e.g. `mtn`). The telco is lowercased. */
  async listDataPlans(telco: string): Promise<DataPlan[]> {
    const t = typeof telco === "string" ? telco.toLowerCase() : telco;
    return this.request({ method: "GET", path: `/v1/bill/data-plan/${seg(t, "telco")}` });
  }

  async buyElectricity(
    params: BuyElectricityParams,
    options: SubAccountOption = {}
  ): Promise<BillPurchaseResult> {
    return this.withMerchantTxRef(
      this.withSubAccount("/v2/bill/electricity", options.subAccountId),
      params
    );
  }

  /** Electricity distribution companies (discos). */
  async listElectricityProviders(): Promise<unknown[]> {
    return this.request({ method: "GET", path: "/v1/bill/electricity/discos" });
  }

  async lookupElectricityCustomer(
    params: LookupElectricityCustomerParams
  ): Promise<ElectricityCustomer> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["disco", "customerId"],
      "bills.lookupElectricityCustomer"
    );
    return this.request({
      method: "GET",
      path: "/v2/bill/electricity/lookup",
      query: { disco: params.disco, customerId: params.customerId },
    });
  }

  async payCableTv(
    params: PayCableTvParams,
    options: SubAccountOption = {}
  ): Promise<BillPurchaseResult> {
    return this.withMerchantTxRef(
      this.withSubAccount("/v2/bill/cabletv", options.subAccountId),
      params
    );
  }

  async listCableTvPlans(cableTvType: CableTvType): Promise<CableTvPlan[]> {
    requireFields({ cableTvType }, ["cableTvType"], "bills.listCableTvPlans");
    return this.request({
      method: "GET",
      path: "/v1/bill/cableTvProduct",
      query: { cableTvType },
    });
  }

  /** Returns the customer's name. */
  async lookupCableTvCustomer(params: LookupCableTvCustomerParams): Promise<string> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["customerId", "cableTvType"],
      "bills.lookupCableTvCustomer"
    );
    return this.request({
      method: "GET",
      path: "/v1/bill/cabletv/lookup",
      query: { customerId: params.customerId, cableTvType: params.cableTvType },
    });
  }

  async fundBetting(
    params: FundBettingParams,
    options: SubAccountOption = {}
  ): Promise<BillPurchaseResult> {
    return this.withMerchantTxRef(
      this.withSubAccount("/v2/bill/betting", options.subAccountId),
      params
    );
  }

  async listBettingProviders(): Promise<BettingProvider[]> {
    return this.request({ method: "GET", path: "/v1/bill/betting/providers" });
  }

  /** Returns the customer's name. */
  async lookupBettingCustomer(params: LookupBettingCustomerParams): Promise<string> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["providerId", "customerId"],
      "bills.lookupBettingCustomer"
    );
    return this.request({
      method: "GET",
      path: "/v1/bill/betting/lookup",
      query: { providerId: params.providerId, customerId: params.customerId },
    });
  }
}
