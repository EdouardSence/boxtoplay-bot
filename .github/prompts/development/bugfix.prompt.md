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
