---
on:
  pull_request_review:
    types: [submitted]
engine: copilot
permissions:
  contents: read
  issues: write
  pull-requests: write
imports:
  - ../../../skills/create-pr.md
tools:
  github:
    toolsets: [repos, issues, pull_requests]
safe-outputs:
  add-comment:
  add-labels:
    allowed: [delivered]
  remove-labels:
    allowed: [in-review]
---

# US Delivery — Final Phase

Only proceed if the review was approved.

Update the issue with delivery status.
Remove label "in-review", add label "delivered".
Comment on the issue with the final summary.
