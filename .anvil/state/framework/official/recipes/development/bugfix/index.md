---
on:
  issues:
    types: [labeled]
    labels: [bug]

engine: copilot

permissions:
  contents: write
  issues: write
  pull-requests: write

imports:
  - ../../skills/coding-principles/index.md
  - ../../skills/test-driven-development/index.md
  - ../../skills/security-review/index.md
  - ../../skills/implement-feature/index.md
  - ../../skills/create-pr/index.md
  - ../../skills/systematic-debugging/index.md

checkpoints:
  after-diagnosis:
    type: approval
    message: "Root cause identified. Review diagnosis before implementing fix."

tools:
  github:
    toolsets: [repos, issues, pull_requests]
  bash: ["git:*", "npm", "node"]

safe-outputs:
  create-pull-request:
    labels: [agent-generated]
    draft: false
  create-comment:
---

# Bugfix

Fix a labeled bug with a minimal, well-tested change.

## Steps
1. Read issue #${{ github.event.issue.number }} and confirm expected behavior
2. Use `systematic-debugging` to diagnose: reproduce the bug, form hypotheses, verify each one, and identify the root cause
3. **CHECKPOINT (`after-diagnosis`):** Present the diagnosis (root cause, affected files, reproduction steps) to the developer for approval before implementing the fix
4. Write a failing test that reproduces the bug (TDD approach)
5. Implement the minimal fix — change only what is necessary to resolve the root cause
6. Run the full test suite (not just the new test) to check for regressions
7. Apply `verification-before-completion` before creating the PR
8. Open a PR linking the issue, including: bug description, root cause analysis, and fix explanation
