---
on:
  issue_comment:
    types: [created]
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
    allowed: [plan-ready]
  remove-labels:
    allowed: [brainstorm-active]
---

# US Brainstorm — Dialogue Loop

Only run if the issue has the label "brainstorm-active" and the comment author is not a bot.

Read the issue, all previous comments, and the analysis.

If there are still open questions:
- Ask ONE question at a time as a comment
- Prefer multiple choice format

If all questions are resolved:
- Summarize decisions in a comment
- Remove label "brainstorm-active"
- Add label "plan-ready"
