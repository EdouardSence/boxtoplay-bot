---
hard_gate: "Do NOT merge the PR yourself. You create and hand off — the team reviews and merges."
---

# Create PR

Prepare a high-quality pull request:

## Title
- Use the ticket title or a concise summary.

## Body
- Summary of changes
- Testing performed
- Linked issues
- Risks and rollout notes

## PR Body Template
```
## Summary
- ...

## Testing
- ...

## Linked Issues
- ...

## Risks / Rollout
- ...
```

## Self-Review Checklist
- Code matches style and architecture
- Tests added or updated
- Edge cases handled
- Docs or README updated if needed
- No debug logs or TODOs without tickets

## Reviewer Assignment
- Add code owners where applicable.
- Include domain experts for impacted modules.
- Add QA or release manager for risky changes.

## Labels and Metadata
- Add type labels (feature, bugfix, chore).
- Add area or component labels.
- Add priority label if the ticket indicates one.
- Add `agent-generated` if applicable.
- Add `in-review` on the linked issue or ticket.

## Related Components
- **Before creating PR**: Run `verification-before-completion` gate to confirm all tests pass
- **Implementation plan**: Include the plan summary from `implement-feature` in the PR body
- **Reviewers**: Check CODEOWNERS file; if absent, ask the developer who should review
