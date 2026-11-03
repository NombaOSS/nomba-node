import { requireFields } from "../internal/utils.js";
import type {
  CreateMandateParams,
  CreateMandateResult,
  DebitMandateParams,
  DebitMandateResult,
  ListMandatesParams,
  MandateList,
  MandateStatus,
  UpdateMandateStatusParams,
  UpdateMandateStatusResult,
} from "../types.js";
import { Resource } from "./base.js";

export class DirectDebits extends Resource {
  async createMandate(params: CreateMandateParams): Promise<CreateMandateResult> {
    return this.request({ method: "POST", path: "/v1/direct-debits", body: params });
  }

  /** Debit a customer against an active mandate. Never retried automatically. */
  async debitMandate(params: DebitMandateParams): Promise<DebitMandateResult> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["mandateId", "amount"],
      "directDebits.debitMandate"
    );
    return this.request({
      method: "POST",
      path: "/v1/direct-debits/debit-mandate",
      body: params,
    });
  }

  async getMandateStatus(mandateId: string): Promise<MandateStatus> {
    requireFields({ mandateId }, ["mandateId"], "directDebits.getMandateStatus");
    return this.request({
      method: "GET",
      path: "/v1/direct-debits/status",
      query: { mandateId },
    });
  }

  async listMandates(params: ListMandatesParams = {}): Promise<MandateList> {
    return this.request({
      method: "GET",
      path: "/v1/direct-debits/mandates",
      query: { ...params },
    });
  }

  async updateMandateStatus(
    params: UpdateMandateStatusParams
  ): Promise<UpdateMandateStatusResult> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["mandateId", "status"],
      "directDebits.updateMandateStatus"
    );
    return this.request({
      method: "PUT",
      path: "/v1/direct-debits/update-status",
      body: params,
    });
  }
}
