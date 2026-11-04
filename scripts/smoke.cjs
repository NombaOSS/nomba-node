// CommonJS half of the runtime smoke test: the require() entry loads and works.
// See smoke.mjs for why this exists.

const assert = require("node:assert/strict");
const {
  Nomba,
  default: Default,
  verifyWebhook,
  VERSION,
} = require("@nombaoss/nomba-node");

assert.equal(Default, Nomba);
assert.equal(typeof verifyWebhook, "function");
assert.equal(Nomba.VERSION, VERSION);
assert.throws(() => new Nomba({ clientId: "a", clientSecret: "b" }), /accountId/);

console.log(`smoke (cjs): ok on Node ${process.version}`);
