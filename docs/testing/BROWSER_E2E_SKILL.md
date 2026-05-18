# Browser E2E Skill

Use this guide for Humanly flows that require a browser agent or human tester:
editor selection, visible AI state, quick actions, uploads, enroll mode, admin
dashboard, certificates, and screenshots.

This guide complements `docs/PRODUCTION_QA_PLAYBOOK.md`. It is the reusable
browser-facing slice of that playbook, not a replacement for API/provider
harnesses.

## Operating Rules

- Use the Codex in-app browser for localhost and production browser checks.
- Keep a QA control issue for any full production pass.
- Update the control issue after each phase, not only at the end.
- Capture the current URL, role, mode, provider/model, and screenshot path for
  every failure.
- Check `docs/REGRESSION_LEDGER.md` before filing a bug.
- File confirmed bugs with `docs/ISSUE_AUTHORING_GUIDE.md`.
- Do not paste API keys, passwords, access tokens, or refresh tokens into
  issues, PRs, reports, or final answers.

## Before Opening The Browser

Run or inspect these first:

```bash
git status --short --branch
pnpm qa:deploy:smoke
pnpm qa:backend:contract
```

For AI-facing browser checks, also run at least a plan-only AI harness:

```bash
pnpm qa:ai:usage
```

## Phase A: User Auth

Goal: fresh user identity path works.

Steps:

1. Open the user portal.
2. Register a fresh user.
3. Log out.
4. Log in again.
5. Try one wrong-password login.
6. Refresh the page and confirm the session is still coherent.

Expected:

- Correct credentials work.
- Wrong credentials fail visibly and safely.
- Refresh does not strand the user on an inconsistent page.

Evidence:

- Account email.
- URL after login.
- Console/network errors if any.

## Phase B: Personal Document Mode

Goal: self-created document workflow is usable.

Steps:

1. Create a new document.
2. Type several paragraphs.
3. Paste text.
4. Rename the document.
5. Upload a small PDF.
6. Reload the page.
7. Confirm editor content and file list survive reload.

Expected:

- No editor crash.
- PDF loads or shows a bounded, actionable error.
- Document state persists.

## Phase C: AI Chat

Goal: agentic chat uses tools when appropriate and keeps reasoning separate from
final output.

Steps:

1. Configure one stable text model.
2. Ask a grounded PDF question.
3. Confirm visible activity updates while the model works.
4. Confirm tool calls appear as tool-call UI, not raw markup.
5. Ask a negative lookup question.
6. Switch to another stable model and ask a simple follow-up.
7. Attach an image only when the selected model supports image input.

Expected:

- Document questions trigger tool calls.
- Final answer is not `I could not produce a final answer...` unless a bounded
  provider failure genuinely occurred.
- Raw DSML/XML/JSON pseudo tool markup does not leak into the final message.
- Reasoning is shown separately from the final answer.
- Model switching does not break subsequent turns.
- Image input is hidden, refused, or handled according to model capability.

Record:

- Provider/model.
- Question.
- Tool-call count if visible.
- Whether reasoning, tools, and final answer were separated.

## Phase D: Quick Actions

Goal: selection-based quick actions rewrite only the selected text.

Steps:

1. Select a short sentence in the editor.
2. Run grammar.
3. Run improve.
4. Run simplify.
5. Run formal.
6. Apply one result.
7. Cancel one result.

Expected:

- Quick actions do not require document retrieval tool calls.
- They operate on selected text only.
- They do not insert fallback text into the document.
- Apply/cancel states are responsive and recover after errors.

## Phase E: Enroll Mode

Goal: student task flow works independently from personal documents.

Steps:

1. Use an admin-created invite code.
2. Join the task as a user.
3. Open the task document.
4. Confirm task instructions/files are visible.
5. Write, paste, and use AI if allowed by policy.
6. Submit the task.
7. Reopen the document after submission.

Expected:

- Invite code joins the correct task.
- Task-scoped document is created and linked.
- AI policy matches admin settings.
- Submission state is visible and stable.

## Phase F: Admin Dashboard

Goal: task owner/admin views can inspect the user flow.

Steps:

1. Log into the admin portal.
2. Create or open a task.
3. Verify task settings and model policy.
4. Open dashboard overview.
5. Inspect submissions.
6. Inspect user/document detail.
7. Open analytics/charts if available.
8. Verify certificate or replay links from admin views.

Expected:

- Counts match recent test activity.
- No dashboard cards crash on empty or small datasets.
- Charts render without layout overlap.
- Admin can navigate back to task settings/submissions.

## Phase G: Certificate And Public Verify

Goal: proof artifacts survive the full path.

Steps:

1. Generate a certificate from a personal or task document.
2. Open certificate detail.
3. Open public verify link in a fresh context.
4. Download JSON/PDF if available.
5. Confirm replay/history entry is accessible.

Expected:

- Public verify loads without auth.
- Downloads are not 404.
- Certificate stats are present and plausible.

## Failure Handling

For every confirmed product failure:

1. Reproduce once more unless destructive.
2. Search issues/PRs and `docs/REGRESSION_LEDGER.md`.
3. Classify using `docs/REGRESSION_GUARD.md`.
4. Create a Kordi-style issue.
5. Fix with the smallest coherent branch.
6. Add or name the regression lock.
7. Rerun the failed phase and one adjacent happy path.
