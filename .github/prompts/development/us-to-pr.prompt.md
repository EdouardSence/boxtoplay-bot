# US → PR

A ticket was just labeled "agent-ready". Implement it and open a PR.

## Phase 1 — Analysis (Requirement Analyzer role)
1. Read issue #${{ github.event.issue.number }}
2. Extract: scope, acceptance criteria, constraints, dependencies
3. Evaluate complexity:
   - Small (1-2 files): skip to Phase 3
   - Medium (3-5 files): write a brief plan as issue comment
   - Large (6+ files): write detailed plan, list risks, comment on issue
4. If acceptance criteria are missing, comment with questions and stop

<!-- checkpoint:after-analysis -->

## Phase 2 — Planning
1. Identify impacted files and modules
2. Design approach (max 6 steps)
3. Comment the plan on the issue before proceeding

<!-- checkpoint:after-plan -->

## Phase 3 — Implementation
1. Create branch: feature/us-${{ github.event.issue.number }}
2. Follow coding-principles strictly
3. Small, focused commits
4. No console.log/print left behind

## Phase 4 — Testing (TDD)
1. Write tests covering acceptance criteria
2. Run test suite
3. Fix failures (max 3 retries)

## Phase 5 — Quality Check
1. No dead code or unused imports
2. No TODO/FIXME without linked issue
3. Security review checklist passed

<!-- checkpoint:after-implement -->

## Phase 6 — PR
1. Open draft PR targeting develop
2. Title: issue title
3. Body: summary + link to issue + checklist
4. Label: agent-generated
5. Comment on issue with PR link
6. Add label "in-review" to issue
