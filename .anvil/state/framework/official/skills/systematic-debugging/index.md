---
---

# Systematic Debugging

Random fixes waste time and create new bugs. Quick patches mask root causes.

**Core principle:** ALWAYS find the root cause before attempting fixes.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue:
- Test failures
- Bugs (local or production)
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Especially when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- You don't fully understand the issue

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**
   - For each component boundary: log what enters and exits
   - Verify environment/config propagation
   - Run once to gather evidence showing WHERE it breaks
   - THEN investigate that specific component

5. **Trace Data Flow**
   - Where does the bad value originate?
   - What called this with the bad value?
   - Keep tracing upstream until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

1. **Find Working Examples** — Locate similar working code in same codebase
2. **Compare Against References** — Read reference implementations completely, don't skim
3. **Identify Differences** — List every difference, however small
4. **Understand Dependencies** — What config, environment, or assumptions does it need?

### Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis** — "I think X is the root cause because Y"
2. **Test Minimally** — Make the SMALLEST possible change to test the hypothesis
3. **Verify** — Did it work? Yes → Phase 4. No → form NEW hypothesis
4. **Don't stack fixes** — DON'T add more fixes on top of a failed one

### Phase 4: Implementation

1. **Create Failing Test Case** — Simplest possible reproduction, automated if possible
2. **Implement Single Fix** — Address the root cause. ONE change at a time.
3. **Verify Fix** — Test passes? No other tests broken? Issue actually resolved?
4. **If 3+ Fixes Failed** — STOP. Question the architecture. Discuss with the developer before continuing.

## Red Flags — STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"

**ALL of these mean: STOP. Return to Phase 1.**

## Related Components
- **Test creation (Phase 4)**: Follow `test-driven-development` Bug Fix Workflow for creating regression tests
- **Feature work**: Used by `implement-feature` when implementation is blocked
- **Verification**: Apply `verification-before-completion` after the fix is applied

