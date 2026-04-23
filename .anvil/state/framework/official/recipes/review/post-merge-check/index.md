---
on:
  push:
    branches: [main, develop]

engine: copilot

permissions:
  contents: read
  issues: write

imports:
  - ../../skills/security-review/index.md
  - ../../hooks/dependency-check/index.md

tools:
  github:
    toolsets: [repos, issues]

safe-outputs:
  create-comment:
---

# Post-Merge Check

After merge, verify that critical paths remain healthy.

## Steps
1. Identify the merged changeset from ${{ github.event.after }}
2. Run the full test suite to verify nothing is broken
3. Run the `dependency-check` hook if package files changed (package.json, requirements.txt, etc.)
4. Scan for security regressions using the `security-review` methodology
5. Check CI/CD pipeline status and confirm all checks pass
6. If issues are found, open a follow-up issue with label `post-merge-regression` and priority based on severity (Critical/High = P1, Medium = P2, Low = P3)
