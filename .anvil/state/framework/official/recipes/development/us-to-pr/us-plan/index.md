---
on:
  issues:
    types: [labeled]
    labels: [plan-ready]
  reaction: "rocket"
engine: copilot
permissions:
  contents: read
  issues: write
imports:
  - ../../../skills/coding-principles/index.md
  - ../../../skills/test-driven-development/index.md
tools:
  github:
    toolsets: [repos, issues]
  edit:
  cache-memory:
safe-outputs:
  add-comment:
    max: 2
  add-labels:
    allowed: [plan-approved]
---

# US Plan — Phase 2

Read the issue and all previous comments including the brainstorm summary.

## Planning
1. Identify impacted files and modules
2. Design approach (max 6 steps)
3. Comment the plan on the issue

Write the technical plan as a comment on the issue.
Ask the developer to add label "plan-approved" when ready to proceed.
