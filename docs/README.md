# Humanly Documentation Map

This directory is the entry point for maintainers and agents working on
`humanly-code`. Start here, then open only the document that matches the task.

## Read First

- `CODEX_DEVELOPMENT_MANUAL.md` - canonical development workflow, issue/PR
  rules, release train policy, and what Codex should read before coding.
- `ISSUE_AUTHORING_GUIDE.md` - required Kordi-style issue format.
- `LOCAL_DEV.md` - local mock and real backend setup for browser smoke tests.

## QA And Regression

- `PRODUCTION_QA_PLAYBOOK.md` - reusable end-to-end production test plan.
- `BACKEND_STRESS_TESTING.md` - backend/document/file stress harness.
- `REGRESSION_GUARD.md` - how to decide whether a finding is old, new, or a
  regression.
- `REGRESSION_LEDGER.md` - recurring bug patterns and manual locks.
- `skills/humanly-regression-guard/SKILL.md` - compact skill wrapper for the
  regression process.

## Deployment And Operations

- `PRODUCTION_DEPLOYMENT.md` - production VM, Docker, Artifact Registry, and
  rollback notes.
- `ARCHITECTURE_OPTIMIZATION_BACKLOG.md` - non-urgent architecture and
  performance directions.

## State Tracking

- `AGENT_PROGRESS.md` - short current-state snapshot only. GitHub issues and
  PRs are the source of truth for history.

## Package Reference Docs

Package-specific docs are allowed only when they describe package behavior that
is not obvious from the main docs:

- `packages/backend/ANALYTICS.md`
- `packages/backend/AUTH_IMPLEMENTATION.md`
- `packages/backend/WEBSOCKET.md`
- `packages/backend/src/services/ANALYTICS_README.md`
- `packages/backend/src/services/ANALYTICS_v2_README.md`
- `packages/frontend/README.md`
- `packages/tracker/README.md`

Do not add new top-level Markdown files for temporary handoff notes. Put durable
process in this directory, and put task-specific trace in the GitHub issue.
