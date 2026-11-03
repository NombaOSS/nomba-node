// Quickstart: check the parent account balance in the sandbox.
// NOMBA_CLIENT_ID=... NOMBA_CLIENT_SECRET=... NOMBA_ACCOUNT_ID=... npx tsx examples/quickstart.ts
import Nomba from "@nombaoss/nomba-node";

const nomba = new Nomba(); // reads NOMBA_* env vars; defaults to the sandbox

const parent = await nomba.accounts.getParent();
console.log(`Account: ${parent.accountName} (${parent.accountId})`);

const balance = await nomba.accounts.getBalance();
console.log(`Balance: ${balance.amount} ${balance.currency}`);
