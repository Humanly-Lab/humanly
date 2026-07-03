# Humanly Current State

Last updated: 2026-06-12.

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

## Active Epic

- **Epic #534 — policy-enforcement layer** (deadline-bound: EMNLP paper claims
  #535-#538 must be deployed before 2026-07-04). Implementation order and all
  cross-cutting rules in `docs/EPIC_534_POLICY_ENFORCEMENT_GUIDE.md`. Order:
  #540 (S) -> #537 (M-) -> #536 (M, builds trusted-provider infra) ->
  #538 (M+) -> #535 (L). Integration branch:
  `feat/epic-534-policy-enforcement`.

## Open Known Issues

- None at the moment. Check GitHub issues before starting new work.

## Recently Merged

- #184 / #185 / #189 / #190 / #191 / #192 / #193 - QA harness coverage,
  production browser hardening, direct shortcut routing, quick-action auth
  resilience, admin curated AI model selection, shorter editor autosave, and
  no-reference AI chat preflight for enroll tasks.
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
- #153 / #154 - Codex development manual, documentation map, and docs-only
  deploy skip.
- #105 / #155 - direct `api.writehumanly.net` TLS support, versioned health
  endpoint, certificate SAN guard, and post-deploy HTTPS health checks.

## Release/Deploy State

- `main` is the production branch.
- Product merges to `main` deploy production.
- Docs-only pushes to `main` are ignored by the deploy workflow.
- Related product PRs may merge into `integration/<theme>` or
  `release/<theme>` first, then ship through one final PR to `main`.

## QA State

- Full production regression has been run multiple times on 2026-05-17 and
  2026-05-18.
- The 2026-05-18 user/admin browser QA pass is complete; all findings were
  either closed as non-issues/environment behavior or merged through #193.
- OpenRouter Browser E2E model validation completed on 2026-05-18 in #194:
  all curated OpenRouter models passed PDF chat/tool-card checks; negative
  lookup and one keyboard quick-action apply path also passed.
- Reusable production test flow lives in `docs/PRODUCTION_QA_PLAYBOOK.md`.
- Regression process and old-bug comparison live in
  `docs/REGRESSION_GUARD.md` and `docs/REGRESSION_LEDGER.md`.

## Maintenance Rule

Update this file only when it materially changes the next agent's starting
context. Do not turn it into a full changelog; put durable trace in GitHub
issues and PRs.
