/**
 * Transaction statuses returned in `data.status`. The SDK never throws based on
 * these: a 2xx response with a success `code` is returned as-is. See
 * https://developer.nomba.com/docs/api-basics/response-codes
 */
export const TransactionStatus = {
  /** Service delivered to the destination. Do not refund. */
  SUCCESS: "SUCCESS",
  /** Still processing. Wait for the webhook or requery. */
  PENDING_BILLING: "PENDING_BILLING",
  /** Still processing (v1 endpoints). Wait for the webhook or requery. */
  PROCESSING: "PROCESSING",
  /** Funds returned to your Nomba wallet. Refund your customer. */
  REFUND: "REFUND",
  /** The transaction will not proceed. Contact Nomba support. */
  CANCELLED: "CANCELLED",
  /** Debit failed; Nomba may retry. Wait for the webhook. */
  PAYMENT_FAILED: "PAYMENT_FAILED",
  /** Nomba may retry via another vendor. Wait for the webhook. */
  REVERSED_BY_VENDOR: "REVERSED_BY_VENDOR",
} as const;

export type TransactionStatus =
  (typeof TransactionStatus)[keyof typeof TransactionStatus];

/** Webhook `event_type` values. */
export const WebhookEventType = {
  PAYMENT_SUCCESS: "payment_success",
  PAYMENT_FAILED: "payment_failed",
  PAYMENT_REVERSAL: "payment_reversal",
  PAYOUT_SUCCESS: "payout_success",
  PAYOUT_FAILED: "payout_failed",
  PAYOUT_REFUND: "payout_refund",
} as const;

export type WebhookEventType = (typeof WebhookEventType)[keyof typeof WebhookEventType];

/** Envelope `code` values that mean success. */
export const SUCCESS_CODES = ["00", "200", "201"] as const;

export const BASE_URLS = {
  sandbox: "https://sandbox.nomba.com",
  production: "https://api.nomba.com",
} as const;

export type Environment = keyof typeof BASE_URLS;
