// Verify Nomba webhooks in Express. The handler needs only the signing key,
// not API credentials.
import express from "express";
import {
  verifyWebhook,
  WebhookEventType,
  WebhookVerificationError,
} from "@nombaoss/nomba-node";

const signingKey = process.env.NOMBA_WEBHOOK_SIGNING_KEY ?? "";
const app = express();

// Use the RAW body. express.json() would parse and re-serialise it, and the
// signature would no longer match.
app.post("/webhooks/nomba", express.raw({ type: "*/*" }), (req, res) => {
  let event;
  try {
    // No toleranceSeconds: Nomba doesn't document whether retries get a fresh
    // timestamp, so a tolerance could reject legitimate retries. Dedupe on requestId.
    event = verifyWebhook(req.body as Buffer, req.headers, signingKey);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      res.status(401).send("invalid signature");
      return;
    }
    throw err;
  }

  if (event.event_type === WebhookEventType.PAYMENT_SUCCESS) {
    console.log(`Paid: ${event.data.transaction.transactionAmount} (${event.requestId})`);
  }
  // Respond quickly; do slow work in a queue. Handle duplicates by requestId.
  res.sendStatus(200);
});

app.listen(3000, () => console.log("Listening on http://localhost:3000"));
