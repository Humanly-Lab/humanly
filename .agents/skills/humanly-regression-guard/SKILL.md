---
name: humanly-regression-guard
description: Use when running Humanly QA, filing a QA bug, fixing a QA bug, comparing old versus new findings, or preparing a release report that must classify regressions and prevent recurring bugs.
---

# Humanly Regression Guard

Use this skill whenever a Humanly QA finding might become an issue, bug fix, or
release note.

## Core Rule

Never call a QA finding "new" until you have checked:

1. GitHub issues and PRs.
2. `docs/REGRESSION_LEDGER.md`.
3. The current QA control issue.
4. Recent merged PRs touching the affected subsystem.

If the user asks why QA keeps finding bugs, compare the finding against the
ledger buckets first: old coverage gap, newly introduced product behavior,
provider/infra contract drift, or true regression.

UI checks are browser-agent-assisted manual QA. Do not claim they are fully
unattended CI automation; turn stable failures into lower-level tests or gates
after fixing them.

## Required Workflow

1. Reproduce the finding and capture the exact surface.
2. Classify it as one of:
   - `type:regression`
   - `type:old-gap`
   - `type:new-bug`
   - `type:provider`
   - `type:infra`
3. File an issue only after classification.
4. For product bugs, add a regression lock in the fixing PR.
5. Retest production after deploy when the bug was found on production.
6. Update `docs/REGRESSION_LEDGER.md` if the finding adds a reusable risk.

## References

- Full guide: `docs/REGRESSION_GUARD.md`
- Bug ledger: `docs/REGRESSION_LEDGER.md`
- Production QA playbook: `docs/PRODUCTION_QA_PLAYBOOK.md`
