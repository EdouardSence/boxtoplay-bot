---
on:
  pull_request:
    types: [opened, synchronize]

engine: copilot

permissions:
  contents: read
  pull-requests: write

imports:
  - ../../skills/coding-principles/index.md
  - ../../skills/security-review/index.md

tools:
  github:
    toolsets: [pull_requests, repos]

safe-outputs:
  create-comment:
---

# PR Review

Review the pull request for correctness, security, and maintainability.

## Steps
1. Summarize the change in 3-5 sentences
2. Use the `code-reviewer` agent methodology for a structured review
3. Identify risks, regressions, or missing tests
4. Produce a review checklist:
   - Security: [pass/fail]
   - Tests: [coverage delta]
   - Performance: [N/A or concern]
   - Breaking changes: [yes/no]
5. Provide actionable feedback with file references
6. **Blocking criteria** — request changes if: security vulnerability found, tests missing for new behavior, or breaking change undocumented
7. Approve if no blocking issues exist
