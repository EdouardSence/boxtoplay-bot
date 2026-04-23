---
on:
  issues:
    types: [labeled]
    labels: [agent-ready]
  reaction: "rocket"
engine: copilot
permissions:
  contents: read
  issues: write
imports: []
tools:
  github:
    toolsets: [repos, issues]
  cache-memory:
safe-outputs:
  add-comment:
    max: 3
  add-labels:
    allowed: [brainstorm-active, in-progress]
---

# US Analysis — Phase 1

A ticket was just labeled "agent-ready". Analyze it thoroughly.

## Phase 1 — Analysis (Requirement Analyzer role)
1. Read issue #${{ github.event.issue.number }}
2. Extract: scope, acceptance criteria, constraints, dependencies
3. Evaluate complexity:
   - Small (1-2 files): note it for later phases
   - Medium (3-5 files): write a brief plan as issue comment
   - Large (6+ files): write detailed plan, list risks, comment on issue
4. If acceptance criteria are missing, comment with questions

When analysis is complete, post your first question as a comment on the issue.
Add the label "brainstorm-active" to signal the brainstorm loop.
