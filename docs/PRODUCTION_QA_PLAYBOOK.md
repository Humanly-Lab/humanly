# Production QA Playbook

This playbook turns the long #130 production regression into a reusable
workflow for future agents. It is intentionally procedural: the point is to
make every pass traceable, repeatable, and easy to resume after context loss.

## When To Use This

Use this playbook before a production-facing release, after a risky AI/backend
change, after deployment infrastructure changes, or whenever the user asks for
"full deploy QA", "完整测试", or "from start to finish".

Use `docs/LOCAL_DEV.md` instead for small local visual smoke tests.

## Control Issue

Every full production QA pass gets one GitHub control issue.

Create it with:

```bash
pnpm qa:create-issue
```

Useful options:

```bash
QA_REPO=ShenzheZhu/humanly \
QA_APP_BASE=https://app.writehumanly.net \
QA_ADMIN_BASE=https://admin.writehumanly.net \
QA_TITLE_PREFIX="QA: full production regression pass" \
pnpm qa:create-issue
```

The issue body contains Phase 0 baseline plus Phases 1-14. Update the checklist
as each phase completes, and post a phase comment immediately. Do not wait
until the end to write the report.

## Operating Rules

- Do not print API keys, passwords, refresh tokens, or access tokens in issues,
  PRs, commit messages, or final reports.
- Store runtime secrets only in a local temp artifact such as
  `/tmp/qa-<run-id>.json`.
- Use fresh QA accounts when practical. Account emails can be logged; passwords
  cannot.
- Prefer the production app/admin proxied API paths:
  `https://app.writehumanly.net/api/v1` and
  `https://admin.writehumanly.net/api/v1`.
- Keep direct `api.writehumanly.net` checks separate from product flow checks.
- Confirm GitHub Actions and production deployment after every merged fix.
- File every confirmed bug as a separate issue and link it from the QA control
  issue.
- If a bug is safe to fix in scope: issue -> branch -> commit -> PR -> CI ->
  merge -> deploy -> production retest.
- If a bug is infra, broad architecture, or product policy, leave it open with
  a clear residual-risk note.

## Required Inputs

Minimum:

- Production app URL.
- Production admin URL.
- One AI provider API key if AI phases will run.
- At least one PDF fixture for personal document mode.
- At least one PDF fixture for enroll/task mode.

Recommended:

- Together AI key and OpenRouter key.
- A stable primary model, usually `Qwen/Qwen3.5-397B-A17B`.
- A secondary model list for catalog checks: Qwen, Kimi, DeepSeek, GLM.
- A small structured PDF, such as a syllabus.
- A longer paper PDF for reference-retrieval stress, when provider rate limits
  permit.

## Local Runtime Artifact

Keep a local JSON artifact for IDs and tokens. Suggested shape:

```json
{
  "runId": "qa-YYYYMMDDTHHMMSS",
  "origins": {
    "app": "https://app.writehumanly.net",
    "admin": "https://admin.writehumanly.net"
  },
  "accounts": {
    "user": { "email": "..." },
    "admin": { "email": "..." }
  },
  "tokens": {},
  "ids": {},
  "results": {}
}
```

If a long pass spans many hours, expect tokens to expire. Re-login before each
phase instead of reusing stale tokens.

## Phase 0 Baseline + 14 QA Phases

### Phase 0: Baseline Repo/GitHub/Deploy Health

Goal: confirm the starting point.

Check:

- Current branch, local worktree status, and latest main commit.
- Open PRs.
- Latest CI/deploy status.
- App/admin proxied API health or authenticated 401.
- Direct API TLS status, if relevant.

Pass condition:

- App/admin domains are reachable and the repo state is understood.
- Known residuals are explicitly named.

### Phase 1: Auth

Goal: verify fresh user/admin identity paths.

Check:

- Register fresh user.
- Register fresh admin.
- Login user/admin.
- Wrong role rejected.
- Wrong password rejected.
- Refresh works before logout.
- Logout invalidates old refresh flow.
- Re-login works.

Pass condition:

- Correct roles authenticate and incorrect credentials/roles fail cleanly.

### Phase 2: Personal Document Mode

Goal: verify self-created document workflow.

Check:

- Create document.
- Update title/content.
- Track representative document events: focus, paste, input, blur.
- Read document stats.
- Upload a personal PDF/reference file.
- List files.
- Generate certificate.
- Check certificate detail/list/public verify/history.
- Download JSON and PDF.
- Browser smoke document and verify pages.

Pass condition:

- Document, file, events, certificate, public verify, and downloads all work.

### Phase 3: Admin Task Creation

Goal: verify task owner setup.

Check:

- Create task with active dates, AI policy, model allow-list, and environment
  config.
- Upload instruction PDF.
- List task files.
- Update task settings.
- Read task list/detail counters before enrollment.
- Browser smoke admin task list and settings.

Pass condition:

- Admin can create/configure a task and publish an invite code.

### Phase 4: Enroll Mode

Goal: verify invite-code student workflow.

Check:

- Join task by invite code.
- Create task-scoped submission document.
- Link enrollment to document.
- Start/end submission session.
- Track focus/paste/input/select/blur events.
- Verify task instruction PDF is accessible to enrolled user.
- Browser smoke `/documents` and task document page.

Pass condition:

- Enrolled user can open/edit a task document and events flow into backend.

### Phase 5: AI Provider Settings

Goal: verify provider configuration and model catalogs.

Check:

- Settings GET masks keys.
- Invalid base URLs fail with useful errors.
- Together settings save/test.
- OpenRouter settings save/test.
- Existing-key sentinel path works.
- Stable model options are discoverable.

Pass condition:

- Provider settings are safe, masked, and can return usable model catalogs.

### Phase 6: AI Chat

Goal: verify grounded agentic chat.

Check:

- Use the task document with uploaded PDF.
- Ask direct lookup questions with expected answers.
- Ask missing-evidence question and expect honest "not found".
- Confirm no DSML/XML/JSON pseudo tool-call markup leaks.
- Confirm no "could not produce final answer" leaks.
- Confirm provider stalls return bounded fallback instead of infinite spinner.
- Inspect tool-call/thinking visibility at the UI level when possible.

Pass condition:

- The answer is grounded, visible output is clean, and failure mode is bounded.

Provider caveat:

- Dense Together testing can trigger low dynamic RPM limits. Space calls apart
  or treat provider 429/503 as operational unless the app hangs or corrupts
  output.

### Phase 7: Quick Actions

Goal: verify selected-text AI actions.

Check:

- Grammar.
- Improve.
- Simplify.
- Formal.

Pass condition:

- Each quick action returns only rewritten selected text, does not call retrieval
  tools, does not leak markup/fallback text, and can be applied safely.

### Phase 8: Submission And Certificate

Goal: verify task submission and certificate chain.

Check:

- Submit enrolled task document.
- Capture submission id and certificate id/token.
- Authenticated certificate detail/list/AI-stats.
- Certificate JSON/PDF downloads.
- Public verify API.
- Public edit-history API.
- Admin task submissions list.
- Admin submission events/replay endpoint.
- Browser smoke public verify page.

Pass condition:

- Submission snapshot and certificate are immutable, public verify works, and
  admin can inspect the submission.

### Phase 9: Admin Dashboard

Goal: verify task owner observability.

Check:

- Task list.
- Overview tab.
- Submission tab.
- Users tab.
- User detail page.
- Analytics tab.
- Settings tab.
- Submission event detail page.

Pass condition:

- Counters, submissions, events, certificates, analytics, and settings render
  without console/runtime errors.

Special check:

- After a task submission, analytics completion rate should be non-zero once a
  submitted session exists. The exact percentage may change during QA because
  opening documents creates additional sessions.

### Phase 10: Edge/API Negative Tests

Goal: verify boundary behavior.

Check examples:

- Unauthenticated document/task requests.
- Invalid invite code.
- Malformed invite code.
- User reading admin-owned task detail.
- User reading admin analytics.
- Admin reading user-owned document.
- Submit without document id.
- Submit fake document id.
- Admin fake submission events.
- Fake certificate token.
- AI chat fake document id.

Pass condition:

- Requests fail with 400/401/403/404 as appropriate, no 500s, no data leakage.

### Phase 11: UI Navigation/Reload/Persistence

Goal: verify real browser health.

Check:

- User login persists across reload.
- Admin login persists across reload.
- User documents page.
- Task document page.
- Personal document page.
- Certificates page.
- Public verify page.
- Admin task list.
- Admin overview/analytics/submission detail.
- Narrow viewport smoke for user/admin.

Pass condition:

- No unexpected login redirect, runtime error, failed PDF load, or console error.

### Phase 12: Local Automated Regression

Goal: run test automation and document build hygiene.

Run:

```bash
pnpm test
pnpm --filter @humanly/backend build
```

Pass condition:

- Jest suites should pass.
- If build fails on known TypeScript debt, link the residual issue and separate
  it from production runtime QA.

### Phase 13: Bug Fix Loop

Goal: close the loop on issues found during the pass.

For each bug:

- File an issue.
- Fix on a branch if in scope.
- Commit and PR.
- Watch CI.
- Merge/deploy according to current repo policy.
- Retest production.
- Close or leave residual with explicit reason.

Pass condition:

- No untriaged product bug remains.

### Phase 14: Final Report

Goal: produce the release-quality summary.

Include:

- Executive verdict.
- Phase table.
- Bugs fixed and PRs merged.
- Residual open issues.
- AI/provider caveats.
- Certificate/submission coverage.
- Admin dashboard coverage.
- Automated test counts.
- Recommended manual smoke path.
- Final repo/deploy state.

Close the control issue when the report is posted.

## Reusable Comment Skeleton

Use this shape for every phase comment:

```markdown
## Phase N — Short Name

Status: PASS / PASS after fix / FAIL / BLOCKED.

What was tested:
- ...

Key evidence:
- ...

Bugs:
- None.
- Or: #123 / PR #124, retested on production.

Residual:
- ...
```

## Retest Discipline

Do not call a bug fixed after CI alone. For product bugs, retest production
after deployment completes. The minimum retest is:

- The failing request or UI path now passes.
- Nearby path still passes.
- The control issue is updated with concrete evidence.

## Final Manual Smoke Recommendation

For a human sanity pass after this playbook, keep it short:

1. Admin creates task, uploads PDF, enables Qwen.
2. User joins invite and opens task document.
3. User asks one grounded PDF question.
4. User tries the four quick actions on selected text.
5. User submits.
6. Admin opens submissions/analytics.
7. Public certificate verify page opens.
