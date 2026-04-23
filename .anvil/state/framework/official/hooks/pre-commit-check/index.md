---
---

# Pre-Commit Check

Run before every commit to catch problems early. Prevents broken code, leaked secrets, and style violations from entering the repository.

## Trigger

Before `git commit` — blocks the commit if checks fail.

## Checks

### 1. Lint & Format

Run the project's linter and formatter. Detect the tool automatically:

| Stack | Linter | Formatter |
|-------|--------|-----------|
| Node.js | `eslint` | `prettier` |
| Python | `ruff` or `flake8` | `black` or `ruff format` |
| Java | `checkstyle` | `google-java-format` |
| Go | `golangci-lint` | `gofmt` |
| Rust | `clippy` | `rustfmt` |

**If no linter is configured:** Skip with a warning, don't block.

### 2. Tests (Fast Only)

Run unit tests — not integration or E2E tests.

- Node.js: `npm test -- --bail` or `jest --bail --changedSince=HEAD`
- Python: `pytest -x --timeout=30`
- Java: `mvn test -pl <changed-modules> -Dtest=<changed-tests>`
- Go: `go test ./... -short`

**If tests take longer than 60 seconds:** Skip with a note to run full suite before PR.

### 3. Secret Detection

Scan staged files for patterns that look like secrets:

**Block commit if found:**
- API keys: patterns like `AKIA[0-9A-Z]{16}`, `sk-[a-zA-Z0-9]{32,}`
- Private keys: `-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----`
- Connection strings with passwords
- Tokens: `ghp_`, `gho_`, `github_pat_`, `xoxb-`, `xoxp-`
- High-entropy strings in known secret locations (`.env`, `credentials`, `secrets`)

**Ignore:**
- Files in `.gitignore`
- Test fixtures with fake/example secrets
- Lock files

### 4. File Size Check

Warn if any staged file exceeds 1MB. Block if any exceeds 10MB.

Large files usually belong in Git LFS or an artifact store, not in the repository.

## Output

```
Pre-Commit Check
────────────────
✅ Lint: clean
✅ Tests: 23 passed (4.2s)
❌ Secrets: possible API key in src/config.ts:14
⚠️  File size: assets/logo.png (2.3MB) — consider Git LFS

Commit blocked — fix secrets issue before committing.
```

## Configuration

The hook respects a `.pre-commit-config` or equivalent project configuration if present. If no config exists, it uses sensible defaults based on detected stack.

## Rules

- Never skip the secret detection check
- Fast feedback — total check time should be under 30 seconds
- Don't auto-fix — report issues and let the developer decide
- If a check can't run (tool not installed), warn but don't block
