# Issue Authoring Guide

Humanly issues must be detailed enough that another agent can pick them up
without rediscovering the problem from scratch. Use the Kordi-style issue shape:
clear problem statement, exact repro, expected behavior, likely failure path,
scope, acceptance criteria, out-of-scope boundaries, and file pointers.
The reference quality bar is Kordi issue #460:
`https://github.com/Kordi-AI/Kordi/issues/460`.

Do not open vague issues like "AI is broken" or "dashboard bug." If the finding
is real but the scope is still uncertain, write the uncertainty explicitly.

## Required Sections

Use this template for product bugs, QA findings, and implementation issues:

```markdown
## Target branch
`main` or the relevant integration branch.

## Classification
`type:regression` / `type:old-gap` / `type:new-bug` / `type:provider` / `type:infra`

## Problem
Describe the user-visible failure in concrete terms. Include the role, mode,
provider/model, and page/API surface when relevant.

## Expected behavior
Describe the exact behavior the user should see. Include timing, UI state,
error copy, retry behavior, and data persistence expectations when relevant.

## Repro
1. Start from a clean, named state.
2. Perform exact UI/API steps.
3. Observe the actual failure.

## Where the failure likely lives
Explain the suspected code path, boundary, or subsystem. If uncertain, list the
top hypotheses and why.

## Scope
- Files, services, routes, components, or docs likely in scope.
- Data/provider/deploy surfaces that must be checked.

## Acceptance criteria
- [ ] Observable fix criterion.
- [ ] No regression in the adjacent happy path.
- [ ] Regression lock added or updated.
- [ ] Production/local retest criterion, if applicable.

## Out of scope
- Explicitly name nearby work that should not be bundled into this issue.

## File pointers
- `path/to/file.ts` - why this file matters.

## Reference
Screenshots, logs, QA issue comments, prior issues/PRs, provider response IDs,
or manual-test artifacts.
```

## Quality Bar

Before opening an issue:

1. Search old issues and PRs.
2. Check `docs/REGRESSION_LEDGER.md` for matching symptoms.
3. Classify the issue before filing.
4. Include enough evidence that a different agent can reproduce it.
5. Include concrete acceptance criteria.
6. Include file pointers whenever code ownership is knowable.

For UI issues, include screenshots or a precise browser-agent observation. For
AI/provider issues, include provider, model, request mode, visible output,
tool-call behavior, and whether the app degraded gracefully.

## Current Issue Cleanup Rule

If an existing open issue is too thin, update it before starting implementation.
Do not build from a vague issue body. The first commit may be documentation-only
cleanup of the issue plan, but the issue itself should be clear before coding.
