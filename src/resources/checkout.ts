import { ValidationError } from "../errors.js";
import type { RequestOptions } from "../internal/http.js";
import { isRecord, randomUUID, requireFields } from "../internal/utils.js";
import type {
  CancelTransactionParams,
  ChargeSavedCardParams,
  ChargeSavedCardResult,
  CheckoutTransaction,
  ConfirmTransactionReceiptResult,
  CreateOrderParams,
  CreateOrderResult,
  DeleteSavedCardParams,
  GetCheckoutTransactionParams,
  GetOrderResult,
  GetSavedCardsParams,
  ListSavedCardsParams,
  OrderReferenceParams,
  RefundParams,
  RequestSaveCardOtpParams,
  SavedCardList,
  StatusMessage,
  SubmitCardDetailsParams,
  SubmitCardDetailsResult,
  SubmitCardOtpParams,
  SubmitCardOtpResult,
  SubmitUserOtpParams,
  SuccessMessage,
  TransferAccount,
  UpdateSavedCardEmailParams,
  UpdateSavedCardEmailResult,
  UserSavedCards,
} from "../types.js";
import { Resource, seg } from "./base.js";

type Params = Record<string, unknown>;

export class Checkout extends Resource {
  /** Create a hosted checkout order and get its `checkoutLink`. */
  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    if (!isRecord(params?.order)) {
      throw ValidationError.client('checkout.createOrder: "order" is required');
    }
    return this.request({ method: "POST", path: "/v1/checkout/order", body: params });
  }

  async getOrder(orderReference: string): Promise<GetOrderResult> {
    return this.request({
      method: "GET",
      path: `/v1/checkout/order/${seg(orderReference, "orderReference")}`,
    });
  }

  async cancelOrder(params: OrderReferenceParams): Promise<SuccessMessage> {
    requireFields(
      params as unknown as Params,
      ["orderReference"],
      "checkout.cancelOrder"
    );
    return this.request({
      method: "POST",
      path: "/v1/checkout/order/cancel",
      body: params,
    });
  }

  /** A checkout transaction by order ID or order reference. */
  async getTransaction(
    params: GetCheckoutTransactionParams
  ): Promise<CheckoutTransaction> {
    requireFields(
      params as unknown as Params,
      ["idType", "id"],
      "checkout.getTransaction"
    );
    return this.request({
      method: "GET",
      path: "/v1/checkout/transaction",
      query: { idType: params.idType, id: params.id },
    });
  }

  /** Refund a checkout transaction. Never retried automatically. */
  async refund(params: RefundParams): Promise<SuccessMessage> {
    requireFields(params as unknown as Params, ["transactionId"], "checkout.refund");
    return this.request({ method: "POST", path: "/v1/checkout/refund", body: params });
  }

  /**
   * Charge a saved (tokenized) card. This endpoint has no `merchantTxRef`; its
   * reference is `order.orderReference`. If you omit it the SDK generates one
   * (UUID v4) and returns it as `orderReference`. Never retried automatically.
   */
  async chargeSavedCard(params: ChargeSavedCardParams): Promise<ChargeSavedCardResult> {
    requireFields(params as unknown as Params, ["tokenKey"], "checkout.chargeSavedCard");
    const body: Params = { ...params };
    let reference: RequestOptions["reference"];
    if (isRecord(params.order)) {
      const order: Params = { ...params.order };
      if (typeof order.orderReference !== "string" || order.orderReference === "") {
        order.orderReference = await randomUUID();
      }
      reference = { field: "orderReference", value: order.orderReference as string };
      body.order = order;
    }
    return this.request({
      method: "POST",
      path: "/v1/checkout/tokenized-card-payment",
      body,
      reference,
    });
  }

  /** Saved cards, filtered by customer email and/or date range (page-numbered). */
  async listSavedCards(params: ListSavedCardsParams = {}): Promise<SavedCardList> {
    return this.request({
      method: "GET",
      path: "/v1/checkout/tokenized-card-data",
      query: { ...params },
    });
  }

  async updateSavedCardEmail(
    params: UpdateSavedCardEmailParams
  ): Promise<UpdateSavedCardEmailResult> {
    requireFields(
      params as unknown as Params,
      ["tokenKey", "currentEmailAddress", "newEmailAddress"],
      "checkout.updateSavedCardEmail"
    );
    return this.request({
      method: "POST",
      path: "/v1/checkout/tokenized-card-data",
      body: params,
    });
  }

  /** Delete a saved card. Sends a JSON body with DELETE. */
  async deleteSavedCard(params: DeleteSavedCardParams): Promise<StatusMessage> {
    requireFields(params as unknown as Params, ["tokenKey"], "checkout.deleteSavedCard");
    return this.request({
      method: "DELETE",
      path: "/v1/checkout/tokenized-card-data",
      body: params,
    });
  }

  /** The bank account a customer can transfer to for this order. */
  async getTransferAccount(orderReference: string): Promise<TransferAccount> {
    return this.request({
      method: "GET",
      path: `/v1/checkout/get-checkout-kta/${seg(orderReference, "orderReference")}`,
    });
  }

  async submitCardDetails(
    params: SubmitCardDetailsParams
  ): Promise<SubmitCardDetailsResult> {
    return this.request({
      method: "POST",
      path: "/v1/checkout/checkout-card-detail",
      body: params,
    });
  }

  async submitCardOtp(params: SubmitCardOtpParams): Promise<SubmitCardOtpResult> {
    requireFields(
      params as unknown as Params,
      ["otp", "orderReference", "transactionId"],
      "checkout.submitCardOtp"
    );
    return this.request({
      method: "POST",
      path: "/v1/checkout/checkout-card-otp",
      body: params,
    });
  }

  async resendOtp(params: OrderReferenceParams): Promise<SuccessMessage> {
    requireFields(params as unknown as Params, ["orderReference"], "checkout.resendOtp");
    return this.request({
      method: "POST",
      path: "/v1/checkout/resend-otp",
      body: params,
    });
  }

  async confirmTransactionReceipt(
    params: OrderReferenceParams
  ): Promise<ConfirmTransactionReceiptResult> {
    requireFields(
      params as unknown as Params,
      ["orderReference"],
      "checkout.confirmTransactionReceipt"
    );
    return this.request({
      method: "POST",
      path: "/v1/checkout/confirm-transaction-receipt",
      body: params,
    });
  }

  async cancelTransaction(params: CancelTransactionParams): Promise<SuccessMessage> {
    requireFields(
      params as unknown as Params,
      ["transactionId", "forceCancel"],
      "checkout.cancelTransaction"
    );
    return this.request({
      method: "POST",
      path: "/v1/checkout/transaction/cancel",
      body: params,
    });
  }

  /** Send an OTP to a customer who wants to save their card. */
  async requestSaveCardOtp(params: RequestSaveCardOtpParams): Promise<SuccessMessage> {
    requireFields(
      params as unknown as Params,
      ["orderReference", "phoneNumber"],
      "checkout.requestSaveCardOtp"
    );
    return this.request({
      method: "POST",
      path: "/v1/checkout/user-card/auth",
      body: params,
    });
  }

  /** Send an OTP to a customer who already has saved cards. */
  async requestSavedCardsOtp(params: OrderReferenceParams): Promise<SuccessMessage> {
    requireFields(
      params as unknown as Params,
      ["orderReference"],
      "checkout.requestSavedCardsOtp"
    );
    return this.request({
      method: "POST",
      path: "/v1/checkout/user-card/saved-card/auth",
      body: params,
    });
  }

  async submitUserOtp(params: SubmitUserOtpParams): Promise<SuccessMessage> {
    requireFields(
      params as unknown as Params,
      ["orderReference", "phoneNumber", "otp"],
      "checkout.submitUserOtp"
    );
    return this.request({ method: "POST", path: "/v1/checkout/user-card", body: params });
  }

  /** The customer's saved cards for this order, after OTP verification. */
  async getSavedCards(
    orderReference: string,
    params: GetSavedCardsParams
  ): Promise<UserSavedCards> {
    requireFields(params as unknown as Params, ["otp"], "checkout.getSavedCards");
    return this.request({
      method: "GET",
      path: `/v1/checkout/user-card/${seg(orderReference, "orderReference")}`,
      query: { otp: params.otp },
    });
  }
}
