---
hard_gate: "Do NOT deviate from the approved plan without asking first. Do not add features not in the plan."
---

# Implement Feature

Follow a consistent implementation workflow:

## Plan
- **Read project documentation first**: If `.agent/docs/ARCHITECTURE.md` exists, read it to understand system structure. If `.agent/docs/CODEBASE.md` exists, read it for module organization and conventions.
- Identify impacted files and modules.
- Outline a minimal change plan (max 6 steps).

## Implement
- **Follow project conventions**: If `.agent/docs/CONVENTIONS.md` exists, follow its branching, commit, and coding standards.
- Create a feature branch named after the ticket.
- Make small, focused commits.
- Keep changes aligned with coding principles and project conventions.

## Branch Naming Convention
- `feature/us-{id}-{slug}` (e.g., `feature/us-1234-add-export`)

## Commit Message Format
- Conventional Commits: `type(scope): summary`
- Examples: `feat(api): add export endpoint`, `fix(ui): handle empty state`

## Progressive Implementation Strategy
1. **Scaffold**: create files, interfaces, and wiring. Check `.agent/docs/API.md` for endpoint contracts and `.agent/docs/DATABASE.md` for schema requirements.
2. **Core logic**: implement the main behavior.
3. **Edge cases**: handle errors, validation, and boundary conditions.
4. **Polish**: refactor for clarity and add docs/tests.

## When to Stop and Ask for Clarification
- Acceptance criteria conflict or are missing.
- Data contracts or APIs are undefined.
- Changes impact multiple teams or services without owners.
- Test expectations are unclear or tooling is missing.

## Validate
- Run tests related to the change.
- Add new tests for new behavior.

## Communicate
- Summarize changes in the PR.
- Link to the originating ticket.

## Related Components
- **Before starting**: Read project docs from `.agent/docs/` (ARCHITECTURE.md, CODEBASE.md, CONVENTIONS.md)
- **For test creation**: Follow `test-driven-development` skill (RED-GREEN-REFACTOR cycle)
- **Before claiming done**: Apply `verification-before-completion` gate
- **For PR creation**: Hand off to `create-pr` skill
- **If blocked**: Switch to `systematic-debugging` workflow
