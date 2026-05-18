# Humanly Documentation Map

This directory is the entry point for maintainers and agents working on
`humanly-code`. Start here, then open only the document that matches the task.

## Read First

- `CODEX_DEVELOPMENT_MANUAL.md` - canonical development workflow, issue/PR
  rules, release train policy, and what Codex should read before coding.
- `ISSUE_AUTHORING_GUIDE.md` - required Kordi-style issue format.
- `LOCAL_DEV.md` - local mock and real backend setup for browser smoke tests.

## QA And Regression

- `testing/README.md` - modular QA framework: backend contract, AI usage,
  deploy smoke, and browser-agent-assisted E2E layers.
- `.agents/skills/humanly-browser-e2e/SKILL.md` - Codex repo skill for browser
  E2E user/admin QA and focused AI model matrix checks.
- `.agents/skills/humanly-backend-contract/SKILL.md` - Codex repo skill for
  lightweight backend/API/auth/document/file/AI-settings contract checks.
- `.agents/skills/humanly-ai-usage/SKILL.md` - Codex repo skill for
  provider/model/tool/image/app-level AI usage checks.
- `.agents/skills/humanly-deploy-smoke/SKILL.md` - Codex repo skill for
  deployment, TLS, proxy, static asset, and API reachability checks.
- `.agents/skills/humanly-backend-stress/SKILL.md` - Codex repo skill for
  heavier backend document/event/file stress probes.
- `testing/BROWSER_E2E_PLAYBOOK.md` - human-readable browser E2E playbook for
  user/admin flows that require visual/editor judgment.
- `PRODUCTION_QA_PLAYBOOK.md` - reusable end-to-end production test plan.
- `BACKEND_STRESS_TESTING.md` - backend/document/file stress harness.
- `AI_USAGE_STRESS_TEST_REPORT_2026-05-17.md` - baseline production AI usage
  stress report across stable models, PDFs, UI chat, and quick actions.
- `MODEL_WHITELIST_QA_2026-05-17.md` - model-list refresh QA for issue #172,
  including provider smoke, Humanly agentic PDF matrix, and excluded candidates.
- `REGRESSION_GUARD.md` - how to decide whether a finding is old, new, or a
  regression.
- `REGRESSION_LEDGER.md` - recurring bug patterns and manual locks.
- `.agents/skills/humanly-regression-guard/SKILL.md` - Codex repo skill wrapper
  for the regression process.

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
