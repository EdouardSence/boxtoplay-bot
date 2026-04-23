---
---

# Test-Driven Development (TDD)

Write the test first. Watch it fail. Write minimal code to pass. Refactor.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over. No exceptions.

## When to Use

**Always:**
- New features
- Bug fixes
- Refactoring
- Behavior changes

**Exceptions (ask the developer):**
- Throwaway prototypes
- Generated code
- Configuration files

## Red-Green-Refactor

### RED — Write Failing Test

Write one minimal test showing what should happen.

**Good test:**
- Tests one behavior
- Has a clear, descriptive name
- Uses real code, not mocks (unless unavoidable)

**Bad test:**
- Vague name (`test('it works')`)
- Tests multiple behaviors
- Tests mock behavior instead of real behavior

### Verify RED — Watch It Fail

**MANDATORY. Never skip.**

Run the test. Confirm:
- Test **fails** (not errors from typos)
- Failure message matches expectations
- Fails because feature is missing

**Test passes immediately?** You're testing existing behavior. Fix the test.

### GREEN — Minimal Code

Write the simplest code to make the test pass. Nothing more.

- Don't add features beyond what the test requires
- Don't refactor other code
- Don't "improve" while you're at it

### Verify GREEN — Watch It Pass

**MANDATORY.**

Run the test. Confirm:
- Test passes
- All other tests still pass
- No warnings or errors in output

**Test fails?** Fix code, not the test.

### REFACTOR — Clean Up

Only after green:
- Remove duplication
- Improve naming
- Extract helpers if needed

Keep all tests green. Don't add behavior during refactor.

### Repeat

Next failing test for next behavior.

## Red Flags — STOP and Start Over

- Code written before test
- Test added after implementation
- Test passes immediately on first run
- Can't explain why test failed
- Rationalizing "just this once"

**All of these mean: Delete code. Start over with TDD.**

## Bug Fix Workflow

1. **RED** — Write test that reproduces the bug
2. **Verify RED** — Watch it fail with the bug
3. **GREEN** — Fix the bug with minimal change
4. **Verify GREEN** — Test passes, bug is fixed
5. **REFACTOR** — Clean up if needed

Never fix bugs without a failing test first.

## When Stuck

| Problem | Solution |
|---------|----------|
| Don't know how to test | Write the API you wish existed. Assert first. |
| Test too complicated | Design too complicated. Simplify the interface. |
| Must mock everything | Code too coupled. Use dependency injection. |
| Test setup is huge | Extract helpers. Still complex? Simplify design. |

## Verification Checklist

Before marking work complete:

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for the expected reason
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output is clean (no errors, no warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and error paths covered

## Related Components
- **Verification**: Use `verification-before-completion` to confirm tests pass before claiming done
- **Debugging**: If tests are hard to write, use `systematic-debugging` to understand the code first
- **Feature workflow**: This skill is used by the `implement-feature` skill during the Validate phase
