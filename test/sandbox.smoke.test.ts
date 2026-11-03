// Opt-in smoke test against the real Nomba sandbox. Skipped unless
// NOMBA_SANDBOX_CLIENT_ID, NOMBA_SANDBOX_CLIENT_SECRET and NOMBA_SANDBOX_ACCOUNT_ID
// are set. Never runs in CI.
import { describe, expect, it } from "vitest";
import Nomba from "../src/index.js";

const env = {
  clientId: process.env.NOMBA_SANDBOX_CLIENT_ID,
  clientSecret: process.env.NOMBA_SANDBOX_CLIENT_SECRET,
  accountId: process.env.NOMBA_SANDBOX_ACCOUNT_ID,
};
const enabled =
  Boolean(env.clientId && env.clientSecret && env.accountId) && !process.env.CI;

describe.skipIf(!enabled)("sandbox smoke test", () => {
  it("issues a token and fetches the parent account", async () => {
    const nomba = new Nomba({ ...env, environment: "sandbox" });
    const parent = await nomba.accounts.getParent();
    expect(parent.accountId).toBeTruthy();
    await nomba.auth.revoke();
  });
});
