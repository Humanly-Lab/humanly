# Codex Development Manual

This is the canonical operating manual for future Humanly development. Codex is
the primary developer for this repository; avoid adding assistant-specific
handoff docs elsewhere.

## 1. Start-Of-Task Checklist

Before coding:

1. Confirm the current branch and worktree state.
2. Read `docs/README.md` to choose the smallest relevant reference set.
3. Inspect open GitHub issues and PRs when the task touches active work.
4. Create or reuse a GitHub issue unless the user explicitly says the change is
   a quick coordination/doc note that does not need one.
5. Upgrade thin issues to the `ISSUE_AUTHORING_GUIDE.md` quality bar before
   implementation.
6. Branch from the target branch named in the issue.

Use `rg` for code and docs search. Prefer reading nearby code before inventing a
new pattern.

## 2. Issue Discipline

Default loop:

1. Issue
2. Branch
3. Code
4. Small logical commits
5. Push
6. PR
7. CI/local verification
8. User merge unless explicitly authorized otherwise
9. Close/delete stale branches and update docs only when the state changed

Issue granularity:

- One coherent feature or bug = one issue.
- Closely coupled UI/backend changes in the same user flow should stay in one
  issue with internal tasks.
- Split issues only when they can be developed, reviewed, and reverted
  independently.
- Every confirmed bug issue follows `docs/ISSUE_AUTHORING_GUIDE.md`, modeled on
  Kordi issue quality: target branch, classification, problem, expected
  behavior, repro, likely failure path, scope, acceptance criteria, out of
  scope, file pointers, and references.

## 3. Branch And Release Policy

Production deploys run from `main`. Avoid using `main` as the scratchpad for
many small product PRs.

Use one of these paths:

| Path | Use When | Merge Target | Production Deploy |
| --- | --- | --- | --- |
| Direct hotfix | Urgent production bug, narrow blast radius | `main` | Yes, immediately |
| Normal single PR | One coherent product change ready to ship | `main` | Yes, on merge |
| Integration train | Several related PRs should be reviewed separately but shipped together | `integration/<theme>` or `release/<date-or-theme>` | No until final release PR to `main` |
| Docs/process only | Markdown or docs-only process update | `main` | No, ignored by deploy workflow |

Integration train rules:

1. Create `integration/<theme>` from current `main`.
2. Open feature PRs into that integration branch.
3. Run CI on each PR and the integration branch.
4. When the train is ready, open one release PR from the integration branch to
   `main`.
5. The release PR is the production deploy boundary.

Hotfixes can bypass a train. Do not batch unrelated high-risk fixes just to save
a deploy.

## 4. Commit And PR Rules

- Commit often, but keep commits logical.
- Commit messages reference the issue, for example:
  `docs: #153 consolidate Codex development manual`.
- Do not mix unrelated cleanup into product fixes.
- Do not open a PR for every small local change. Accumulate closely related
  changes on one branch and open a PR only at a coherent review/deploy
  boundary. Each merge to `main` can rebuild and redeploy production, so
  unnecessary PR churn wastes time and adds deployment noise.
- Exception: a direct hotfix may open and merge a tiny PR when production CI,
  deploy, or a user-blocking bug is already broken and needs an immediate
  isolated fix.
- PR body must include `Closes #<issue>` unless the PR intentionally only
  references or partially addresses an issue.
- If one PR closes multiple issues, list each issue and explain why one PR is
  safer than several.

## 5. Verification Ladder

Pick the lightest verification that proves the change:

- Docs-only: link check/search for stale references, `git diff --check`, and any
  relevant workflow syntax check.
- Backend logic: use `.agents/skills/humanly-backend-contract/SKILL.md`,
  targeted backend tests, then broader tests when the surface is shared.
- Frontend visible UX: local mock browser smoke in `docs/LOCAL_DEV.md`.
- AI/provider behavior: use `.agents/skills/humanly-ai-usage/SKILL.md` with
  live execution, trace capture, and manual judgment when prompt/tool behavior
  matters.
- Deployment or TLS/proxy changes: use
  `.agents/skills/humanly-deploy-smoke/SKILL.md`.
- Browser-visible user/admin flows: use
  `.agents/skills/humanly-browser-e2e/SKILL.md` and follow
  `docs/testing/BROWSER_E2E_PLAYBOOK.md`.
- Production release: use `docs/PRODUCTION_QA_PLAYBOOK.md`.

Always run `pnpm build:all` before release-style merges when product code or
workflow gates changed. CI also runs it.

## 6. Regression Handling

When a test finds a bug:

1. Search old issues/PRs and `docs/REGRESSION_LEDGER.md`.
2. Classify it with `docs/REGRESSION_GUARD.md`.
3. Open a Kordi-style issue with concrete evidence.
4. Fix it in the smallest coherent branch.
5. Add or update a regression lock if practical.
6. Retest the affected flow and the adjacent happy path.

The goal is not to claim "no bugs." The goal is to make every new bug genuinely
new, keep old bugs from resurfacing silently, and record the reason a bug was
missed.

## 7. Local Development

Use `pnpm`, not `npm`.

Common commands from repo root:

```bash
pnpm install
pnpm build:shared
pnpm build:editor
pnpm dev:mock
pnpm dev:backend
pnpm dev:frontend
pnpm dev:frontend-user
pnpm build:all
pnpm test:backend
pnpm test:frontend-user
pnpm lint
```

For local browser smoke:

- Mock/no-auth path: `docs/LOCAL_DEV.md`
- Real DB/LLM path: `docs/LOCAL_DEV.md`
- Production QA: `docs/PRODUCTION_QA_PLAYBOOK.md`

## 8. Documentation Hygiene

Use this hierarchy:

1. `README.md` - short public entry and command quickstart.
2. `docs/README.md` - documentation map.
3. `docs/CODEX_DEVELOPMENT_MANUAL.md` - development process.
4. Task-specific docs in `docs/` only when durable.
5. Package README files only for package-specific behavior.

Delete stale docs instead of preserving them as archaeology. If a doc points at
nonexistent files, old package names, wrong commands, or assistant-specific
instructions, update or remove it in the same PR that discovers the drift.

Temporary progress belongs in GitHub issues and PRs, not new Markdown files.

## 9. Production Deploy Notes

The deploy workflow ignores docs-only pushes to `main`. Product code, Docker,
workflow, package, lockfile, migration, and script changes still deploy after
merge to `main`.

If deployment fails because the VM is low on disk:

- The workflow performs pre-fetch Docker cleanup before `git fetch`.
- `scripts/deploy.sh` performs post-deploy image cleanup after the new images
  are running.
- Do not prune Docker volumes unless the user explicitly approves it.
