import { requireFields } from "../internal/utils.js";
import type {
  AssignTerminalParams,
  SubAccountOption,
  Terminal,
  TerminalPaymentRequestParams,
  TerminalPaymentRequestResult,
} from "../types.js";
import { Resource, seg } from "./base.js";

export class Terminals extends Resource {
  /** Assign a terminal to the parent account or a sub account. */
  async assign(
    params: AssignTerminalParams,
    options: SubAccountOption = {}
  ): Promise<Terminal> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["serialNumber"],
      "terminals.assign"
    );
    return this.request({
      method: "POST",
      path: this.withSubAccount("/v1/terminals/assign", options.subAccountId),
      body: params,
    });
  }

  /** Un-assign a terminal from the parent account or a sub account. */
  async unassign(
    params: AssignTerminalParams,
    options: SubAccountOption = {}
  ): Promise<Terminal> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["serialNumber"],
      "terminals.unassign"
    );
    return this.request({
      method: "POST",
      path: this.withSubAccount("/v1/terminals/unassign", options.subAccountId),
      body: params,
    });
  }

  /** Push a payment request to a terminal. */
  async sendPaymentRequest(
    terminalId: string,
    params: TerminalPaymentRequestParams
  ): Promise<TerminalPaymentRequestResult> {
    requireFields(
      params as unknown as Record<string, unknown>,
      ["merchantTxRef", "amount", "currency"],
      "terminals.sendPaymentRequest"
    );
    return this.request({
      method: "POST",
      path: `/v1/terminals/payment-request/${seg(terminalId, "terminalId")}`,
      body: params,
    });
  }
}
