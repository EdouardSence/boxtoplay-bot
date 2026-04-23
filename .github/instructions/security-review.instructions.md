# Security Review

Perform a lightweight security review for every change.

## Input Handling
- Validate and sanitize external inputs.
- Enforce strict schemas for API boundaries.
- Use allowlists for enums and paths.

## Secrets
- Never log or persist secrets.
- Do not hardcode credentials or tokens.
- Use existing secret management mechanisms.

## Access Control
- Ensure authorization checks exist for sensitive operations.
- Avoid privilege escalation paths.

## OWASP Top 10 Quick Check
- Broken access control
- Cryptographic failures
- Injection
- Insecure design
- Security misconfiguration
- Vulnerable and outdated components
- Identification and authentication failures
- Software and data integrity failures
- Security logging and monitoring failures
- Server-side request forgery (SSRF)

## SQL Injection / XSS Prevention
- Use parameterized queries or query builders.
- Escape or encode untrusted content for HTML, JS, and URLs.
- Reject unexpected HTML in user-generated content where possible.
- Validate and sanitize inputs at the edge.

## Rate Limiting and Abuse Prevention
- Apply rate limits to public endpoints and authentication flows.
- Add abuse detection for repeated failures or suspicious patterns.
- Use backoff or lockouts for brute-force protection.

## Audit Logging Requirements
- Log security-sensitive actions (auth changes, role updates, data exports).
- Include actor, target, timestamp, and outcome.
- Store logs in tamper-resistant storage when available.

## Dependencies
- Avoid introducing unused or high-risk packages.
- Prefer maintained, well-known libraries.

## Data Protection
- Minimize data retention.
- Redact sensitive fields in logs.

## Output Checklist
- Are any new endpoints or actions exposed?
- Are authn/authz checks present and tested?
- Are secrets handled safely?

## Review Methodology
For each file changed:
1. Check inputs — validate and sanitize all external data
2. Check outputs — no sensitive data leaking
3. Check data flow — trace data from entry to storage
4. Check access control — verify authorization at each layer

Prioritize: external inputs → secrets → access control → everything else.

## Related Components
- **Lightweight check**: The `coding-principles` skill references this skill for security rules
- **Deep audit**: For comprehensive audits, use the `security-auditor` agent instead
- **In recipes**: Used by `bugfix` and `pr-review` recipes for security verification
