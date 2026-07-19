# Security Policy

Arbor Lyme Capital is a private application handling financial data. If
you believe you've found a security vulnerability, please report it
responsibly.

## Reporting a Vulnerability

**Preferred: GitHub's private vulnerability reporting.** Open the
repository's **Security** tab → **Report a vulnerability**. This creates a
private advisory visible only to the repository owner — please use this
rather than a public issue, so a real vulnerability isn't disclosed before
it can be fixed.

If private reporting isn't available to you for some reason, open a
regular issue with minimal detail (e.g., "potential security issue, please
contact me for details") rather than describing the vulnerability
publicly, and the repository owner will follow up.

## Scope

This is a private, single-owner application, not a commercial product with
a bug bounty program. There is no reward for reports — only the shared
interest in a secure application.

Particularly high-value reports (given the application's domain, see
[`docs/threat-model.md`](docs/threat-model.md)):

- Any way to access another user's data (Row-Level Security bypass, IDOR)
- Authentication or session handling flaws
- Exposure of the Supabase service-role key or any other secret
- Audit log tampering (bypassing the append-only guarantee)
- Injection vulnerabilities

## Response

As a private, actively-developed project, there's no formal SLA, but
reports will be acknowledged and investigated promptly.

## Supported Versions

This project does not maintain multiple released versions — only the
current state of the `main` branch (and, during active milestone
development, the milestone branch) is supported.
