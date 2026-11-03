# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `Nomba` client for Node 18+ with zero runtime dependencies, using the global `fetch`. Ships as ESM and CommonJS with TypeScript declarations.
- Configuration from options or `NOMBA_CLIENT_ID`, `NOMBA_CLIENT_SECRET`, `NOMBA_ACCOUNT_ID` and `NOMBA_ENVIRONMENT`. Defaults to the sandbox.
- Lazy authentication with refresh 5 minutes before expiry, a fallback to a fresh token when refresh is rejected, one shared in-flight token request, and a single retry after a 401. `nomba.auth.revoke()` revokes the token. A pluggable `tokenStore` lets several instances share one token.
- Resources: `accounts`, `virtualAccounts`, `checkout`, `transfers`, `transactions`, `terminals`, `directDebits`, `bills` (v2 purchase endpoints), `globalPayout` and `globalCollection`, with typed requests and responses.
- Typed errors: `ApiError` with `AuthenticationError`, `PermissionDeniedError`, `NotFoundError`, `ValidationError`, `RateLimitError` and `ServerError`, plus `ConnectionError`, `TimeoutError`, `ConfigurationError` and `WebhookVerificationError`.
- Automatic retries with exponential backoff for GET and token requests only. POST, PUT and DELETE are never retried.
- `merchantTxRef` generated (UUID v4) for transfers and bill purchases when you don't pass one, and returned on the result. `checkout.chargeSavedCard` does the same with `order.orderReference`.
- Path parameter validation that rejects empty values, `.`, `..` and `/`.
- Auto-paging async iterators: `transactions.listAll`, `transactions.filterAll`, `transactions.listAllBankTransactions`, `accounts.listAllTerminals` and `virtualAccounts.listAll`.
- Webhook verification (`verifyWebhook`, `Nomba.webhooks.verify`) with constant-time, case-insensitive comparison and optional timestamp tolerance.
- `TransactionStatus` and `WebhookEventType` constants.
