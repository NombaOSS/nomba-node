import type {
  CollectionTransaction,
  InitiateInflowParams,
  InitiateInflowResult,
  Provider,
} from "../types.js";
import { Resource, seg } from "./base.js";

export class GlobalCollection extends Resource {
  /** Mobile-money providers for DRC inflows. */
  async listDrcProviders(): Promise<Provider[]> {
    return this.request({
      method: "GET",
      path: "/v1/global-collection/drc/inflow/providers",
    });
  }

  /** Start a mobile-money inflow. Never retried automatically. */
  async initiateInflow(params: InitiateInflowParams): Promise<InitiateInflowResult> {
    return this.request({
      method: "POST",
      path: "/v1/global-collection/inflow/initiate",
      body: params,
    });
  }

  async getTransaction(transactionId: string): Promise<CollectionTransaction> {
    return this.request({
      method: "GET",
      path: `/v1/global-collection/transactions/${seg(transactionId, "transactionId")}`,
    });
  }
}
