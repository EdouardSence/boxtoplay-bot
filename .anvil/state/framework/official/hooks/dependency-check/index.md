---
---

# Dependency Check

Scan project dependencies for known vulnerabilities, outdated packages, and unnecessary bloat.

## Trigger

- Before creating a PR
- Periodically (weekly recommended)
- After adding new dependencies

## Process

### 1. Vulnerability Scan

Run the appropriate audit tool for the project's package manager:

| Package Manager | Command |
|----------------|---------|
| npm | `npm audit` |
| yarn | `yarn audit` |
| pnpm | `pnpm audit` |
| pip | `pip-audit` or `safety check` |
| Go | `govulncheck ./...` |
| Cargo | `cargo audit` |
| Maven | `mvn dependency-check:check` |
| Gradle | `gradle dependencyCheckAnalyze` |
| Bundler | `bundle-audit check` |

### 2. Outdated Check

List dependencies that are behind their latest versions:

| Package Manager | Command |
|----------------|---------|
| npm | `npm outdated` |
| pip | `pip list --outdated` |
| Go | `go list -u -m all` |
| Cargo | `cargo outdated` |

Categorize by severity:
- **Major version behind** — likely breaking changes, review carefully
- **Minor version behind** — new features, generally safe to update
- **Patch version behind** — bug fixes, update promptly

### 3. Unused Dependencies

Detect dependencies that are declared but not imported:

- Node.js: check `package.json` dependencies against actual imports
- Python: check `requirements.txt` against actual imports
- Other stacks: skip if no reliable tool available

### 4. License Check

Flag dependencies with restrictive or incompatible licenses:

- **Block:** GPL, AGPL (if your project is not GPL-compatible)
- **Warn:** LGPL, MPL (may have implications)
- **OK:** MIT, Apache-2.0, BSD, ISC, Unlicense

## Output

```
Dependency Check
────────────────
🔴 Vulnerabilities: 2 critical, 1 high
   - lodash@4.17.20 — prototype pollution (CVE-2021-23337)
   - axios@0.21.1 — SSRF (CVE-2021-3749)
   - tar@6.1.0 — path traversal (CVE-2021-37713)

⚠️  Outdated: 8 packages
   Major: react@17.0.2 → 19.0.0, webpack@4.46.0 → 5.91.0
   Minor: typescript@5.3.3 → 5.4.5
   Patch: eslint@8.56.0 → 8.57.0 (5 more)

⚠️  Unused: 2 packages
   - moment (not imported anywhere)
   - lodash.merge (replaced by native spread)

✅ Licenses: all compatible

Recommended actions:
1. Fix critical vulnerabilities immediately
2. Remove unused dependencies
3. Plan major version updates for next sprint
```

## Rules

- Critical and high vulnerabilities should block PRs
- Don't auto-update — report findings for the developer to review
- Unused dependency detection may have false positives — flag, don't remove
- License issues are informational unless the project has strict requirements
- Keep the report concise — group similar issues together
