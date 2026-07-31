# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a vulnerability

Please **do not** open a public GitHub Issue for security vulnerabilities.

Prefer one of these private channels:

1. [GitHub Security Advisories](https://github.com/tower1229/Refined-X/security/advisories/new) for this repository (preferred)
2. Contact the maintainer through the email listed on the [GitHub profile](https://github.com/tower1229) if Advisories are unavailable

Include:

- A description of the issue and impact
- Steps to reproduce or a proof of concept
- Affected component (static site build, client Ask UI, or `examples/public-ask-worker`)
- Any suggested fix

You should receive an acknowledgement within a few days. Please give a reasonable window for a fix before any public disclosure.

## Scope notes

- The optional Public Ask Worker involves Cloudflare AI Search, AI Gateway, D1, Turnstile, and API keys. Misconfiguration (open CORS, missing rate limits, leaked secrets) is often an ops issue; still report clear auth/abuse bypasses privately.
- Sample demo content and public documentation are not sensitive.
