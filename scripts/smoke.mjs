// Runtime smoke test for the published package, with no dev dependencies.
//
// CI runs the full vitest suite on Node 22 and 24, where the dev tools run.
// On older Node versions the SDK still has to work, so CI installs the packed
// tarball into an empty app and runs this script (and smoke.cjs) against it.
//
// Usage: node smoke.mjs  (from a directory where @nombaoss/nomba-node is installed
// and webhook-fixture.json sits next to this file)

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import Nomba, {
  NotFoundError,
  ServerError,
  verifyWebhook,
  WebhookVerificationError,
} from "@nombaoss/nomba-node";

const calls = [];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fake Nomba API: token issue, then whatever `route` answers. */
function client(route) {
  return new Nomba({
    clientId: "smoke-client",
    clientSecret: "smoke-secret",
    accountId: "smoke-account",
    fetch: async (url, init) => {
      const { pathname } = new URL(url);
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ method: init.method, pathname, body, headers: init.headers });
      if (pathname === "/v1/auth/token/issue") {
        return json({
          code: "00",
          data: {
            access_token: "smoke-token",
            refresh_token: "smoke-refresh",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        });
      }
      return route(init.method, pathname, body);
    },
  });
}

// 1. Auth, headers and envelope unwrapping.
{
  const nomba = client(() => json({ code: "00", data: { amount: 100 } }));
  const balance = await nomba.accounts.getBalance();
  assert.deepEqual(balance, { amount: 100 });
  const call = calls.at(-1);
  assert.equal(call.pathname, "/v1/accounts/balance");
  assert.equal(call.headers.Authorization, "Bearer smoke-token");
  assert.equal(call.headers.accountId, "smoke-account");
}

// 2. Money-moving calls get a UUID merchantTxRef (exercises crypto on every Node).
{
  const nomba = client(() => json({ code: "00", data: { status: "SUCCESS" } }));
  const result = await nomba.transfers.toBank({
    amount: 100,
    accountNumber: "0123456789",
    accountName: "Smoke Test",
    bankCode: "058",
  });
  assert.match(result.merchantTxRef, /^[0-9a-f-]{36}$/);
  assert.equal(calls.at(-1).body.merchantTxRef, result.merchantTxRef);
}

// 3. POSTs are never retried, and the error keeps the reference.
{
  let attempts = 0;
  const nomba = client(() => {
    attempts++;
    return json({ code: "500", description: "down" }, 500);
  });
  await assert.rejects(
    nomba.transfers.toWallet({ amount: 1, receiverAccountId: "x" }),
    (err) => err instanceof ServerError && err.reference?.field === "merchantTxRef"
  );
  assert.equal(attempts, 1);
}

// 4. Error mapping.
{
  const nomba = client(() => json({ code: "404", description: "nope" }, 404));
  await assert.rejects(nomba.virtualAccounts.get("missing"), NotFoundError);
}

// 5. Webhook verification with the documented test vector.
{
  const body = readFileSync(
    new URL("./webhook-fixture.json", import.meta.url),
    "utf8"
  ).trim();
  const headers = {
    "nomba-signature": "q30yFZDyykoymBf9+mt1wz5UAuLk57raPGPHlGzIv00=",
    "nomba-timestamp": "2025-09-29T10:51:44Z",
  };
  const event = verifyWebhook(body, headers, "SampleSignatureKey123");
  assert.equal(event.event_type, "payment_success");
  assert.throws(
    () => verifyWebhook(body, headers, "wrong-key"),
    WebhookVerificationError
  );
}

console.log(`smoke (esm): ok on Node ${process.version}`);
