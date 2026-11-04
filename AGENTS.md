# nomba-node

TypeScript/Node SDK for the Nomba API (`@nombaoss/nomba-node`). Zero runtime dependencies, global `fetch`, Node >= 18, ESM + CJS. Sibling SDKs in Python and PHP follow the same design, so keep method names, errors and behaviour aligned with them.

## Rules

- Conventional commits; main squash-merges, so the PR title becomes the commit. Stage files by name.
- Never push to main. Branch and open a PR. Merge only when Sam says so.
- No AI attribution in commits, PRs or code comments.
- Public repo: don't name private Nomba repos.
- Never call the real Nomba API in tests: inject a mock `fetch`. The sandbox smoke test is opt-in and never runs in CI.

## Releasing

Never publish, create tags or Releases by hand; see `RELEASING.md`.

## Runtime support

The SDK supports Node >= 18, but the dev tools need Node 22+. Run them on Node 22 or 24. CI covers Node 18 and 20 with `scripts/smoke.mjs` / `scripts/smoke.cjs` against the packed tarball; extend those scripts when a runtime behaviour must be checked on old Node.

## Before pushing

`npm run lint && npm run format:check && npm run type-check && npm test && npm run test:coverage && npm run build`

## Safety invariants

- Only GET and token issue/refresh are retried automatically. POST, PUT and DELETE are never retried (money could move twice); the one exception is the single retry after a 401, which Nomba did not process.
- Never log, stringify or put in error messages: the client secret, access tokens, refresh tokens or the `Authorization` header. Secrets live in `#private` fields; errors carry method and path only (no query, no headers).
- Every path parameter goes through `encodePathSegment` (`src/internal/utils.ts`), which rejects empty values, `.`, `..`, `/` and `\`.
- Money-moving calls (`transfers.toBank`, `transfers.toWallet`, `bills.*` purchases) go through `withMerchantTxRef`; `checkout.chargeSavedCard` applies the same rule to `order.orderReference`. Errors thrown from these calls carry the reference (`err.reference`, set with `attachErrorReference`). A new money-moving method must do the same.
- Webhook signatures are compared exactly (no case folding) with `timingSafeEqual`.
- Redirects are refused (`redirect: "error"`) so the bearer token only goes to the configured host.
- The HTTP client must not import Node-only modules at top level; only `src/webhooks.ts` imports `node:crypto`.
- Runtime dependencies stay empty.
