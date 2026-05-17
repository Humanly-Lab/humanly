# Humanly Current State

Last updated: 2026-05-17.

GitHub issues and pull requests are the source of truth. This file is only a
short state snapshot for fast agent orientation.

## Current Operating Rules

- Codex is the primary autonomous developer for `humanly-code`.
- Start from `docs/README.md`, then read only the task-specific docs.
- Use `docs/CODEX_DEVELOPMENT_MANUAL.md` for workflow, release trains, commits,
  PRs, verification, and documentation hygiene.
- Use `docs/ISSUE_AUTHORING_GUIDE.md` before opening or implementing from an
  issue.
- Use `docs/REGRESSION_GUARD.md` and `docs/REGRESSION_LEDGER.md` before filing
  a bug from QA.

## Open Known Issue

- #105 - `api.writehumanly.net` TLS certificate hostname mismatch. The deployed
  app/admin proxy API paths work and remain the QA path until this infra issue is
  handled.

## Recently Merged

- #142 / #143 - production QA playbook, QA issue initializer, architecture
  backlog, and analytics query indexes.
- #140 / #141 / #145 - backend build debt and export route/document-event
  semantics.
- #146 / #147 - regression discipline, Kordi-style issue authoring, and
  `pnpm build:all` CI gate.
- #149 / #150 - pre-fetch VM Docker cleanup so full disks do not block deploy
  before `git fetch`.
- #151 / #152 - post-deploy image cleanup so old app image sets are removed
  after a successful release.

## Release/Deploy State

- `main` is the production branch.
- Product merges to `main` deploy production.
- Docs-only pushes to `main` are ignored by the deploy workflow.
- Related product PRs may merge into `integration/<theme>` or
  `release/<theme>` first, then ship through one final PR to `main`.

## QA State

- Full production regression has been run multiple times on 2026-05-17.
- Reusable production test flow lives in `docs/PRODUCTION_QA_PLAYBOOK.md`.
- Regression process and old-bug comparison live in
  `docs/REGRESSION_GUARD.md` and `docs/REGRESSION_LEDGER.md`.

## Maintenance Rule

Update this file only when it materially changes the next agent's starting
context. Do not turn it into a full changelog; put durable trace in GitHub
issues and PRs.
