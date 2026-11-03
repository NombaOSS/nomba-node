# Security policy

## Reporting a vulnerability

Email **security@nomba.com** with a description of the issue, the affected version and steps to reproduce. Please do not open a public issue for security problems.

We acknowledge reports within three working days and keep you updated until the issue is fixed and released.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

Only the latest minor release receives security fixes before 1.0.0.

## How the SDK protects you

- The client secret, access token, refresh token and `Authorization` header are never logged and never appear in error messages, `JSON.stringify` or `console.log` output.
- POST, PUT and DELETE requests are never retried automatically, so a network error cannot move money twice.
- Path parameters are validated and URL-encoded, so an ID cannot reach a different endpoint.
- Redirects are refused, so credentials are only ever sent to the configured Nomba host.
- Webhook signatures are compared in constant time.
