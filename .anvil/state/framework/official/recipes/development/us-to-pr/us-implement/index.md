---
on:
  issues:
    types: [labeled]
    labels: [plan-approved]
  reaction: "rocket"
engine: copilot
permissions:
  contents: write
  issues: write
  pull-requests: write
imports:
  - ../../../skills/coding-principles/index.md
  - ../../../skills/test-driven-development/index.md
  - ../../../skills/implement-feature/index.md
  - ../../../skills/create-pr/index.md
tools:
  github:
    toolsets: [repos, issues, pull_requests]
  edit:
  bash: ["npm", "mvn", "gradle", "git:*"]
  cache-memory:
safe-outputs:
  create-pull-request:
    labels: [agent-generated]
    draft: true
  add-comment:
  add-labels:
    allowed: [in-review]
---

# US Implementation — Phase 3

Read the issue, all comments, and the approved plan.

## Implementation
1. Create branch: feature/us-${{ github.event.issue.number }}
2. Follow coding-principles strictly
3. Small, focused commits
4. No console.log/print left behind

## Testing (TDD)
1. Write tests covering acceptance criteria
2. Run test suite
3. Fix failures (max 3 retries)

## Quality Check
1. No dead code or unused imports
2. No TODO/FIXME without linked issue
3. Security review checklist passed

Open a draft PR targeting develop. Comment the PR link on the issue.
Add label "in-review" to the issue.
