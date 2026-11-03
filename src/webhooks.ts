import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookVerificationError } from "./errors.js";
import { isRecord } from "./internal/utils.js";
import type { WebhookEvent } from "./types.js";

/** Headers as a fetch `Headers` object or a plain object (e.g. Node's `req.headers`). */
export type WebhookHeaders =
  { get(name: string): string | null } | Record<string, string | string[] | undefined>;

export interface VerifyWebhookOptions {
  /**
   * Reject events whose `nomba-timestamp` is more than this many seconds away from
   * now (replay protection). Off by default.
   */
  toleranceSeconds?: number;
  /** Override the clock (for tests). */
  now?: Date;
}

function header(headers: WebhookHeaders, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === "function") {
    const v = (headers as { get(name: string): string | null }).get(name);
    return v ?? undefined;
  }
  const record = headers as Record<string, string | string[] | undefined>;
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === name) {
      const v = record[key];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function field(v: unknown): string {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : String(v as number);
}

/** Strict RFC 3339, e.g. `2025-09-29T10:51:44Z` or `2025-09-29T11:51:44.123+01:00`. */
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** `responseCode` as signed: null, absent and the string "null" all become "". */
function signedResponseCode(event: WebhookEvent): string {
  const responseCode = field(event.data.transaction.responseCode);
  return responseCode === "null" ? "" : responseCode;
}

/** The string Nomba signs, per https://developer.nomba.com/docs/api-basics/webhook */
export function webhookSignedMessage(event: WebhookEvent, timestamp: string): string {
  const { merchant, transaction } = event.data;
  return [
    event.event_type,
    event.requestId,
    field(merchant.userId),
    field(merchant.walletId),
    field(transaction.transactionId),
    field(transaction.type),
    field(transaction.time),
    signedResponseCode(event),
    timestamp,
  ].join(":");
}

/** base64(HMAC-SHA256(signingKey, message)). */
export function computeWebhookSignature(
  event: WebhookEvent,
  timestamp: string,
  signingKey: string
): string {
  return createHmac("sha256", signingKey)
    .update(webhookSignedMessage(event, timestamp), "utf8")
    .digest("base64");
}

function parseEvent(rawBody: string | Uint8Array | ArrayBuffer): WebhookEvent {
  if (
    typeof rawBody !== "string" &&
    !(rawBody instanceof Uint8Array) &&
    !(rawBody instanceof ArrayBuffer)
  ) {
    throw new WebhookVerificationError(
      "Webhook body must be the raw request body as a string or bytes, not a parsed object"
    );
  }
  const text =
    typeof rawBody === "string"
      ? rawBody
      : new TextDecoder("utf-8").decode(
          rawBody instanceof ArrayBuffer ? new Uint8Array(rawBody) : rawBody
        );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WebhookVerificationError("Webhook body is not valid JSON");
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.event_type !== "string" ||
    typeof parsed.requestId !== "string" ||
    !isRecord(parsed.data) ||
    !isRecord(parsed.data.merchant) ||
    !isRecord(parsed.data.transaction)
  ) {
    throw new WebhookVerificationError(
      "Webhook body is missing event_type, requestId, data.merchant or data.transaction"
    );
  }
  return parsed as WebhookEvent;
}

/**
 * Verify a Nomba webhook and return the parsed event. Throws
 * {@link WebhookVerificationError} if the signature or payload is not valid.
 *
 * Pass the **raw** request body exactly as received. Re-serialising a parsed
 * object can change it and break verification.
 */
export function verifyWebhook(
  rawBody: string | Uint8Array | ArrayBuffer,
  headers: WebhookHeaders,
  signingKey: string,
  options: VerifyWebhookOptions = {}
): WebhookEvent {
  if (typeof signingKey !== "string" || signingKey === "") {
    throw new WebhookVerificationError("A webhook signing key is required");
  }
  if (!headers || typeof headers !== "object") {
    throw new WebhookVerificationError("Webhook headers are required");
  }
  const signature =
    header(headers, "nomba-signature") ?? header(headers, "nomba-sig-value");
  if (!signature) throw new WebhookVerificationError("Missing nomba-signature header");
  const timestamp = header(headers, "nomba-timestamp");
  if (!timestamp) throw new WebhookVerificationError("Missing nomba-timestamp header");
  const algorithm = header(headers, "nomba-signature-algorithm");
  if (algorithm !== undefined && algorithm !== "HmacSHA256") {
    throw new WebhookVerificationError(`Unsupported signature algorithm "${algorithm}"`);
  }

  // The signed fields are joined with ":" and the timestamp itself contains colons.
  // Without these two checks an attacker holding one genuine webhook could move the
  // front of the timestamp into responseCode (":2025-09-29T10" + "51:44Z") and keep
  // the same HMAC input.
  if (!RFC3339.test(timestamp)) {
    throw new WebhookVerificationError(
      "Invalid nomba-timestamp header: expected RFC 3339"
    );
  }

  const event = parseEvent(rawBody);
  if (signedResponseCode(event).includes(":")) {
    throw new WebhookVerificationError("Invalid data.transaction.responseCode");
  }

  if (options.toleranceSeconds !== undefined) {
    const ts = Date.parse(timestamp);
    if (Number.isNaN(ts))
      throw new WebhookVerificationError("Invalid nomba-timestamp header");
    const now = (options.now ?? new Date()).getTime();
    if (Math.abs(now - ts) > options.toleranceSeconds * 1000) {
      throw new WebhookVerificationError(
        "Webhook timestamp is outside the tolerance window"
      );
    }
  }

  const expected = computeWebhookSignature(event, timestamp, signingKey);
  // Exact, constant-time comparison. Base64 is case-sensitive, so a signature
  // that differs only in letter case is a different signature.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new WebhookVerificationError("Webhook signature does not match");
  }
  return event;
}

/** `nomba.webhooks` / `Nomba.webhooks`. */
export const webhooks = {
  verify: verifyWebhook,
  computeSignature: computeWebhookSignature,
} as const;
