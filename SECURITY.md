# Security Policy

## Supported versions

Wayfare is pre-1.0. Security fixes are made on the `main` branch and released as soon as possible; please run the latest release.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub Security Advisories:
👉 <https://github.com/nullthrone/wayfare/security/advisories/new>

Please include a description, steps to reproduce or a proof of concept, affected version/commit, deployment type (self-hosted / Firebase) and your assessment of the impact.

What to expect:

- acknowledgement within **7 days**,
- an assessment and, if confirmed, a fix timeline within **30 days**,
- credit in the advisory if you wish.

Please give us reasonable time to fix the problem before disclosing it publicly.

## Scope

In scope: authentication/authorisation bypasses, album access control (slug, password, expiry, drafts), media signing and download protection bypasses *beyond* what is documented (screenshots cannot be prevented), injection, SSRF in photo sources, leaking of secrets or tokens, unsafe file handling.

Out of scope: findings requiring a compromised admin or server, missing hardening of *your* reverse proxy, denial of service by volume, social engineering.

The security model is described in the [operator guide](https://nullthrone.github.io/wayfare/en/operator/security).
