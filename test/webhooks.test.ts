import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Nomba, {
  computeWebhookSignature,
  verifyWebhook,
  WebhookEventType,
  WebhookVerificationError,
} from "../src/index.js";
import { client, MockApi } from "./helpers.js";

const fixturePath = new URL("./fixtures/webhook-fixture.json", import.meta.url);
const rawBytes = readFileSync(fixturePath);
const raw = rawBytes.toString("utf8");
const KEY = "SampleSignatureKey123";
const TIMESTAMP = "2025-09-29T10:51:44Z";
// HMAC-SHA256 of the fixture computes to the lower-case "q" form. The upper-case
// variant differs only in letter case and must verify too (Nomba compares
// case-insensitively).
const COMPUTED_SIGNATURE = "q30yFZDyykoymBf9+mt1wz5UAuLk57raPGPHlGzIv00=";
const UPPER_SIGNATURE = "Q30yFZDyykoymBf9+mt1wz5UAuLk57raPGPHlGzIv00=";
const DOC_SIGNATURE = COMPUTED_SIGNATURE;

type Ev = {
  event_type?: unknown;
  requestId?: unknown;
  data?: { merchant?: unknown; transaction?: unknown };
};

const headers = (sig = DOC_SIGNATURE, extra: Record<string, string> = {}) => ({
  "nomba-signature": sig,
  "nomba-timestamp": TIMESTAMP,
  ...extra,
});

describe("webhook verification", () => {
  it("computes the exact documented signature", () => {
    const event = JSON.parse(raw);
    expect(computeWebhookSignature(event, TIMESTAMP, KEY)).toBe(COMPUTED_SIGNATURE);
  });

  it("accepts the documented signature", () => {
    const event = verifyWebhook(raw, headers(), KEY);
    expect(event.event_type).toBe(WebhookEventType.PAYMENT_SUCCESS);
    expect(event.data.transaction.transactionId).toBe(
      "API-VACT_TRA-3C8E1-a4f7c2d9-6b1e-4f38-9c5a-2e8d7b0f1c64"
    );
  });

  it("accepts the signature in a different letter case", () => {
    expect(() => verifyWebhook(raw, headers(UPPER_SIGNATURE), KEY)).not.toThrow();
  });

  it("accepts bytes, ArrayBuffer and a fetch Headers object", () => {
    expect(verifyWebhook(rawBytes, headers(), KEY).requestId).toBeTruthy();
    const ab = rawBytes.buffer.slice(
      rawBytes.byteOffset,
      rawBytes.byteOffset + rawBytes.byteLength
    );
    expect(verifyWebhook(ab, headers(), KEY).requestId).toBeTruthy();
    expect(
      verifyWebhook(new Uint8Array(rawBytes), new Headers(headers()), KEY)
    ).toBeTruthy();
  });

  it("reads headers case-insensitively, and array values", () => {
    expect(
      verifyWebhook(
        raw,
        { "Nomba-Signature": [DOC_SIGNATURE], "NOMBA-TIMESTAMP": TIMESTAMP },
        KEY
      )
    ).toBeTruthy();
  });

  it("falls back to nomba-sig-value", () => {
    expect(
      verifyWebhook(
        raw,
        { "nomba-sig-value": DOC_SIGNATURE, "nomba-timestamp": TIMESTAMP },
        KEY
      )
    ).toBeTruthy();
  });

  it("is available statically and on the instance", () => {
    expect(Nomba.webhooks.verify(raw, headers(), KEY).requestId).toBeTruthy();
    expect(
      client(new MockApi()).webhooks.verify(raw, headers(), KEY).requestId
    ).toBeTruthy();
  });

  it("rejects a wrong key", () => {
    expect(() => verifyWebhook(raw, headers(), "WrongKey")).toThrow(
      WebhookVerificationError
    );
  });

  it("rejects a tampered transactionId", () => {
    const tampered = raw.replace("a4f7c2d9", "a4f7c2d0");
    expect(() => verifyWebhook(tampered, headers(), KEY)).toThrow(/does not match/);
  });

  it("rejects a different timestamp", () => {
    expect(() =>
      verifyWebhook(raw, { ...headers(), "nomba-timestamp": "2025-09-29T10:51:45Z" }, KEY)
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a signature of a different length", () => {
    expect(() => verifyWebhook(raw, headers("abc"), KEY)).toThrow(
      WebhookVerificationError
    );
  });

  it("rejects missing headers", () => {
    expect(() => verifyWebhook(raw, { "nomba-timestamp": TIMESTAMP }, KEY)).toThrow(
      /nomba-signature/
    );
    expect(() => verifyWebhook(raw, { "nomba-signature": DOC_SIGNATURE }, KEY)).toThrow(
      /nomba-timestamp/
    );
    expect(() => verifyWebhook(raw, {}, KEY)).toThrow(WebhookVerificationError);
    expect(() =>
      verifyWebhook(raw, null as unknown as Record<string, string>, KEY)
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a non-HmacSHA256 algorithm but accepts HmacSHA256", () => {
    expect(() =>
      verifyWebhook(
        raw,
        headers(DOC_SIGNATURE, { "nomba-signature-algorithm": "HmacSHA1" }),
        KEY
      )
    ).toThrow(/algorithm/);
    expect(
      verifyWebhook(
        raw,
        headers(DOC_SIGNATURE, { "nomba-signature-algorithm": "HmacSHA256" }),
        KEY
      )
    ).toBeTruthy();
  });

  it("enforces toleranceSeconds when set", () => {
    const within = new Date(Date.parse(TIMESTAMP) + 60_000);
    const outside = new Date(Date.parse(TIMESTAMP) + 301_000);
    expect(
      verifyWebhook(raw, headers(), KEY, { toleranceSeconds: 300, now: within })
    ).toBeTruthy();
    expect(() =>
      verifyWebhook(raw, headers(), KEY, { toleranceSeconds: 300, now: outside })
    ).toThrow(/tolerance/);
    const early = new Date(Date.parse(TIMESTAMP) - 301_000);
    expect(() =>
      verifyWebhook(raw, headers(), KEY, { toleranceSeconds: 300, now: early })
    ).toThrow(/tolerance/);
    expect(() =>
      verifyWebhook(raw, { ...headers(), "nomba-timestamp": "not a date" }, KEY, {
        toleranceSeconds: 300,
      })
    ).toThrow(/Invalid nomba-timestamp/);
  });

  it("ignores the timestamp age by default", () => {
    expect(verifyWebhook(raw, headers(), KEY)).toBeTruthy();
  });

  it("rejects invalid JSON, parsed objects and missing signed fields", () => {
    expect(() => verifyWebhook("{not json", headers(), KEY)).toThrow(/not valid JSON/);
    expect(() =>
      verifyWebhook(JSON.parse(raw) as unknown as string, headers(), KEY)
    ).toThrow(/raw request body/);
    for (const mutate of [
      (e: Ev) => delete e.event_type,
      (e: Ev) => delete e.requestId,
      (e: Ev) => delete e.data?.merchant,
      (e: Ev) => delete e.data?.transaction,
      (e: Ev) => delete e.data,
    ]) {
      const e = JSON.parse(raw);
      mutate(e);
      expect(() => verifyWebhook(JSON.stringify(e), headers(), KEY)).toThrow(/missing/);
    }
    expect(() => verifyWebhook("[]", headers(), KEY)).toThrow(/missing/);
  });

  it("requires a signing key", () => {
    expect(() => verifyWebhook(raw, headers(), "")).toThrow(/signing key/);
  });

  it('treats null, absent and "null" responseCode as empty', () => {
    const base = JSON.parse(raw);
    const sig = computeWebhookSignature(base, TIMESTAMP, KEY);
    for (const rc of [null, "null", undefined]) {
      const e = JSON.parse(raw);
      if (rc === undefined) delete e.data.transaction.responseCode;
      else e.data.transaction.responseCode = rc;
      expect(verifyWebhook(JSON.stringify(e), headers(sig), KEY)).toBeTruthy();
    }
    const e = JSON.parse(raw);
    e.data.transaction.responseCode = "00";
    expect(() => verifyWebhook(JSON.stringify(e), headers(sig), KEY)).toThrow();
  });

  it("stringifies non-string signed fields and treats absent ones as empty", () => {
    const e = JSON.parse(raw);
    e.data.merchant.userId = 12345;
    delete e.data.merchant.walletId;
    const body = JSON.stringify(e);
    const sig = computeWebhookSignature(JSON.parse(body), TIMESTAMP, KEY);
    expect(verifyWebhook(body, headers(sig), KEY)).toBeTruthy();
  });

  it("exports all event type constants", () => {
    expect(Object.values(WebhookEventType).sort()).toEqual(
      [
        "payment_failed",
        "payment_reversal",
        "payment_success",
        "payout_failed",
        "payout_refund",
        "payout_success",
      ].sort()
    );
  });
});
