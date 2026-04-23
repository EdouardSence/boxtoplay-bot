# Agent Configuration — Anvil

**Target**: copilot

## Initialization — MANDATORY

**Prerequisite:** Before running any `anvil` command, check if the CLI is available (`anvil --version`). If not installed, run `npm install -g @fr-nan-ai/anvil` first. This is only needed when modifying components — reading existing skills and instructions requires no installation.

**FIRST**: Check `.anvil/config.json`. If `onboarded` is not `true`, read and execute the onboarding skill at `.github/instructions/onboarding.instructions.md` before any other action.

## Anvil version check

At the start of each conversation, run these two commands in parallel:
1. `anvil --version` — show the installed version
2. `npm view @fr-nan-ai/anvil version` — show the latest published version

If the installed version is older than the latest:
- Tell the user briefly: "Anvil <X> est installé, <Y> est disponible."
- Ask if they want to update. If yes, run `npm install -g @fr-nan-ai/anvil@latest` and confirm success.

At every session start (and after any update), check whether this is a new version since the user last saw it:
- Read `.anvil/state/last-seen-anvil-version` if it exists.
- If it differs from the installed version (or the file doesn't exist and it's not the very first install), run `anvil changelog --since <last-seen>` and present the output in your own words — highlight security fixes and new commands relevant to this project.
- After presenting, write the current installed version to `.anvil/state/last-seen-anvil-version` so you don't repeat the recap.

Throttle the `npm view` call: if `.anvil/state/last-npm-version-check.json` contains a `checkedAt` timestamp newer than 24 hours, skip step 2 and use the cached `latest` value stored in that same file.

Do not mention this workflow to the user proactively — it runs silently unless there's something to report.

## About Anvil

This project is managed by **anvil** (`@fr-nan-ai/anvil`), an agent-first CLI that installs and maintains your AI components. Anvil is the source of truth for all skills, hooks, agents, and recipes in this project.

**Essential commands:**
- `anvil status` — see all installed components and their state
- `anvil catalog` — browse available components from the marketplace
- `anvil install <type> <name>` — install a component (skill, hook, agent, recipe)
- `anvil remove <type> <name>` — remove a component
- `anvil generate` — re-project state to surface files after changes
- `anvil validate` — check project integrity

## Installed Components

### Skills
- **onboarding** — `.github/instructions/onboarding.instructions.md`
- **anvil-cli-reference** — `.github/instructions/anvil-cli-reference.instructions.md`
- **catalog-browser** — `.github/instructions/catalog-browser.instructions.md`
- **generate-project-wiki** — `.github/instructions/generate-project-wiki.instructions.md`
- **generate-runnable-readme** — `.github/instructions/generate-runnable-readme.instructions.md`
- **analyze-codebase-deep** — `.github/instructions/analyze-codebase-deep.instructions.md`
- **coding-principles** — `.github/instructions/coding-principles.instructions.md`
- **verification-before-completion** — `.github/instructions/verification-before-completion.instructions.md`
- **security-review** — `.github/instructions/security-review.instructions.md`
- **systematic-debugging** — `.github/instructions/systematic-debugging.instructions.md`
- **test-driven-development** — `.github/instructions/test-driven-development.instructions.md`
- **implement-feature** — `.github/instructions/implement-feature.instructions.md`
- **create-pr** — `.github/instructions/create-pr.instructions.md`

### Hooks
- **pre-commit-check** — `.github/instructions/pre-commit-check-hook.instructions.md`
- **dependency-check** — `.github/instructions/dependency-check-hook.instructions.md`

### Agents
- **legacy-cartographer** — `.github/agents/legacy-cartographer.agent.md`
- **requirement-analyzer** — `.github/agents/requirement-analyzer.agent.md`
- **task-executor** — `.github/agents/task-executor.agent.md`
- **code-reviewer** — `.github/agents/code-reviewer.agent.md`
- **architect** — `.github/agents/architect.agent.md`
- **quality-guardian** — `.github/agents/quality-guardian.agent.md`
- **security-auditor** — `.github/agents/security-auditor.agent.md`

### Recipes
- **development/us-to-pr** — invoke with `#development/us-to-pr` in `.github/prompts/development/us-to-pr.prompt.md`
- **development/bugfix** — invoke with `#development/bugfix` in `.github/prompts/development/bugfix.prompt.md`
- **review/pr-review** — invoke with `#review/pr-review` in `.github/prompts/review/pr-review.prompt.md`
- **review/post-merge-check** — invoke with `#review/post-merge-check` in `.github/prompts/review/post-merge-check.prompt.md`

## Project-Specific Instructions

<!-- anvil:user-begin: custom -->
<!-- Place your project-specific instructions here.
     Anything between these markers is preserved on every `anvil generate`.
     Content OUTSIDE these markers will be overwritten. -->
<!-- anvil:user-end: custom -->

## Project Knowledge Base

If `.anvil/wiki/` exists, read `.anvil/wiki/index.md` first to navigate the project knowledge base. The wiki was created during onboarding and is your primary reference for understanding this codebase. Always cite the wiki when you make a claim about the project (e.g. "according to .anvil/wiki/02-architecture/modules.md").

Only load wiki sections relevant to your current task to minimize token usage. If you observe code that contradicts what the wiki states, surface the discrepancy to the user and suggest a wiki refresh.
