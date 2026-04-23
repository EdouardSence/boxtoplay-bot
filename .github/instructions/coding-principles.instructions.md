# Coding Principles

Use these principles for all changes unless a repository standard conflicts.

## Foundational Principles

- **DRY** (Don't Repeat Yourself) — Every piece of knowledge has a single, authoritative source. Duplication is the root of maintenance nightmares.
- **YAGNI** (You Aren't Gonna Need It) — Don't build for hypothetical future requirements. Three similar lines of code is better than a premature abstraction.
- **KISS** (Keep It Simple) — The right amount of complexity is the minimum needed for the current task.
- **SOLID** — Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion. Apply where relevant, don't force it.

## Core Values

- Prefer clarity over cleverness. Optimize for future readers.
- Keep changes small and cohesive. One intent per change set.
- Favor stable, predictable behavior. Avoid surprising side effects.
- Preserve public contracts unless explicitly changing them.

## Style and Structure

- Match existing patterns in the codebase before introducing new ones.
- Keep functions short and named for behavior, not implementation.
- Avoid deep nesting; refactor into helpers when logic branches multiply.
- Use strong typing where available to prevent misuse.
- Don't over-engineer. Only make changes that are directly requested or clearly necessary.

## Git Conventions

- Branch naming: `feature/short-slug`, `bugfix/short-slug`, `chore/short-slug`, `hotfix/short-slug`.
- Commit messages use Conventional Commits: `type(scope): summary`.
- Use present tense, imperative mood (e.g., "add validation", not "added").
- Include `BREAKING CHANGE:` footer when behavior or APIs change.

## Code Organization

- Keep files in the closest logical module; avoid cross-layer leakage.
- Prefer explicit module boundaries over shared "utils" buckets.
- Group by feature when changes cross multiple layers.
- Keep public interfaces stable; internal helpers can change freely.
- Don't create helpers, utilities, or abstractions for one-time operations.

## Error Handling

- Fail fast with clear messages when input is invalid.
- Wrap external calls with contextual errors that aid triage.
- Never swallow errors silently.
- Only validate at system boundaries (user input, external APIs). Trust internal code.
- Don't add error handling for scenarios that can't happen.

## Logging Standards

- Log at appropriate levels: `debug` for development, `info` for state changes, `warn` for recoverable issues, `error` for failures.
- Include request IDs or correlation IDs when available.
- Never log secrets, tokens, or raw PII.
- Prefer structured logs over free-form strings.

## Performance

- Measure before optimizing. Prefer algorithmic wins over micro-optimizations.
- Avoid unnecessary work in hot paths (I/O, loops, serialization).

### Security
Apply the `security-review` skill checklist for any security-sensitive changes. Key rules: no hardcoded secrets, validate external inputs, use parameterized queries.

## Documentation

- Update inline docs and README when behavior changes.
- Keep comments focused on "why" rather than "what".
- Don't add docstrings or comments to code you didn't change.

## Review Checklist

- Is the change minimal and focused?
- Are edge cases covered?
- Are errors surfaced and actionable?
- Did we avoid breaking compatibility?
- Is it the simplest solution that works?
