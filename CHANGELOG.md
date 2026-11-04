# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Documentation

- Webhook docs and examples no longer recommend a timestamp tolerance (previously 300 s): Nomba doesn't document whether retries get a fresh `nomba-timestamp`, so a tolerance could reject legitimate retries. Deduplicate on `requestId` instead. The docs also note that the amount, `orderReference`, `merchantTxRef` and `tokenKey` aren't signed, so money decisions should be confirmed with `transactions.get`.

### Changed

- Dev tooling only, no change to the published package: vitest 5, tsup 9, eslint 10 and Node 22 type definitions, which clears the open Dependabot security alerts (all in dev dependencies). CI runs the vitest suite on Node 22 and 24 and, on every supported Node version (18 to 24), installs the packed package into an empty app and runs `scripts/smoke.mjs` and `scripts/smoke.cjs` against it.

## [0.1.1] - 2026-11-04

### Fixed

- `repository.url` in `package.json` uses the `git+https://` form npm expects, so npm no longer rewrites it on publish.

### Changed

- First release published from GitHub Actions through npm trusted publishing, with provenance.

## [0.1.0] - 2026-11-03

### Added

- `Nomba` client for Node 18+ with zero runtime dependencies, using the global `fetch`. Ships as ESM and CommonJS with TypeScript declarations.
- Configuration from options or `NOMBA_CLIENT_ID`, `NOMBA_CLIENT_SECRET`, `NOMBA_ACCOUNT_ID` and `NOMBA_ENVIRONMENT`. Defaults to the sandbox.
- Lazy authentication with refresh 5 minutes before expiry, a fallback to a fresh token when refresh is rejected, one shared in-flight token request, and a single retry after a 401. `nomba.auth.revoke()` revokes the token. A pluggable `tokenStore` lets several instances share one token.
- Resources: `accounts`, `virtualAccounts`, `checkout`, `transfers`, `transactions`, `terminals`, `directDebits`, `bills` (v2 purchase endpoints), `globalPayout` and `globalCollection`, with typed requests and responses.
- Typed errors: `ApiError` with `AuthenticationError`, `PermissionDeniedError`, `NotFoundError`, `ValidationError`, `RateLimitError` and `ServerError`, plus `ConnectionError`, `TimeoutError`, `ConfigurationError` and `WebhookVerificationError`.
- Automatic retries with exponential backoff for GET and token requests only. POST, PUT and DELETE are never retried.
- `merchantTxRef` generated (UUID v4) for transfers and bill purchases when you don't pass one, and returned on the result. `checkout.chargeSavedCard` does the same with `order.orderReference`. Errors from these calls carry the reference as `err.reference`, so you can requery after a timeout.
- Path parameter validation that rejects empty values, `.`, `..` and `/`.
- Auto-paging async iterators: `transactions.listAll`, `transactions.filterAll`, `transactions.listAllBankTransactions`, `accounts.listAllTerminals` and `virtualAccounts.listAll`.
- Webhook verification (`verifyWebhook`, `Nomba.webhooks.verify`) with exact, constant-time signature comparison, strict RFC 3339 `nomba-timestamp` checking and optional timestamp tolerance.
- `TransactionStatus` and `WebhookEventType` constants.
