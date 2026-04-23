---
---

# Verification Before Completion

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = unverified claim
```

## What Requires Verification

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, "logs look good" |
| Bug fixed | Test original symptom: passes | "Code changed, should be fixed" |
| Requirements met | Line-by-line checklist verified | "Tests passing" |

## Red Flags — STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Done!")
- About to commit/push/PR without running tests
- Relying on partial verification
- Thinking "just this once"

## Patterns

**Tests:**
```
CORRECT:  [Run test command] → [See: 34/34 pass] → "All tests pass"
WRONG:    "Should pass now" / "Looks correct"
```

**Build:**
```
CORRECT:  [Run build] → [See: exit 0] → "Build succeeds"
WRONG:    "Linter passed so build should be fine"
```

**Requirements:**
```
CORRECT:  Re-read plan → Create checklist → Verify each item → Report
WRONG:    "Tests pass, so the feature is complete"
```

## Related Components
- **Testing**: Works with `test-driven-development` — verify RED then GREEN
- **Feature completion**: Applied at the end of `implement-feature` before hand-off
- **PR creation**: Applied before `create-pr` to ensure all checks pass

