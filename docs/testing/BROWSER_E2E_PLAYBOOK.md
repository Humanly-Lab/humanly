# Browser E2E Playbook

The Codex repo skill lives at
`.agents/skills/humanly-browser-e2e/SKILL.md`. This file is the durable
human-readable playbook/reference that the skill points to.

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
- For production automated runs, save a verified browser `storageState` once
  and replay it per run. Do not fresh-register a new production account for
  every run; unverified fresh signups are expected to hit verification 403s.
  Treat `storageState` files as secrets and never commit or attach them.

## Before Opening The Browser

Run or inspect these first:

```bash
git status --short --branch
pnpm qa:deploy:smoke
QA_BACKEND_BASE_URL=https://app.writehumanly.net/api/v1 pnpm qa:backend:contract
```

For production mutating backend checks, pass a verified user storageState:

```bash
QA_BACKEND_BASE_URL=https://app.writehumanly.net/api/v1 \
QA_BACKEND_MUTATING=1 \
QA_BACKEND_STORAGE_STATE=/path/to/verified-user.storageState.json \
pnpm qa:backend:contract
```

For AI-facing browser checks, also run at least a plan-only AI harness:

```bash
pnpm qa:ai:usage
```

## Phase Report Template

Post one comment per phase in the QA control issue. Use this shape exactly
enough that future agents can diff one run against another:

```markdown
## Phase <letter/name>: <short title>

Status: pass / fail / blocked / partial
Started:
Finished:

Context:
- Surface: app / admin / localhost / production
- URL(s):
- Role/account:
- Mode: personal document / enroll task / admin task
- Provider/model, if AI-related:
- Fixture(s):

Steps Run:
1.
2.
3.

Expected:

Actual:

Evidence:
- Screenshot(s):
- Console errors:
- Network errors:
- Report artifact:

Bug Links:
- None / #...

Regression Check:
- Ledger match:
- Classification if bug filed:
- Regression lock needed:

Residual Risk:
- None / ...
```

If the phase is large, split it into sub-comments rather than writing a giant
end-of-run memory dump.

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
- Personal documents do not accidentally show task/enroll controls.

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
- Whether the answer cites or names the reference file/page when appropriate.
- Whether retry/model-switch behavior still works after an error.

## Phase C2: Focused AI Model Matrix

Goal: model/provider browser behavior matches the curated production model list
and capability labels. Run this module when adding, removing, renaming, or
reclassifying models, or when changing AI chat, model switching, image input,
reasoning, tool cards, or provider settings.

Detailed reference:
`.agents/skills/humanly-browser-e2e/references/ai-model-matrix.md`.

Curated OpenRouter models:

| Model | Expected label | Image input |
| --- | --- | --- |
| `qwen/qwen3.5-397b-a17b` | `(image+text)` | enabled |
| `qwen/qwen3.5-9b` | `(image+text)` | enabled |
| `moonshotai/kimi-k2.6` | `(image+text)` | enabled |
| `deepseek/deepseek-v4-pro` | `(text only)` | disabled |
| `z-ai/glm-5.1` | `(text only)` | disabled |
| `anthropic/claude-sonnet-4.6` | `(image+text)` | enabled |
| `openai/gpt-5.4-mini` | `(image+text)` | enabled |
| `google/gemini-3.1-flash-lite` | `(image+text)` | enabled |

Fixture question:

```text
What percentage is the final exam worth? Answer briefly and mention the page.
```

Expected answer for the current syllabus fixture: 34%, page 6 or equivalent page
reference.

Per-model checks:

1. Model is selectable.
2. Dropdown label uses explicit `(image+text)` or `(text only)` text, not an
   emoji-only marker.
3. Image attach control is enabled only for image+text models.
4. Grounded PDF question shows live reasoning/status, retrieval tool-card UI,
   and a final answer as separate surfaces.
5. No raw DSML/XML/JSON pseudo tool markup leaks into visible final text.
6. Follow-up turn still works after the model is selected.

Edge checks to run at least once per matrix:

1. Negative lookup returns an honest not-found answer.
2. Quick action still works after a model switch and edits only selected text.
3. Text-only models cannot accept image input.
4. Image-capable models can attach image input when the browser environment can
   operate the file chooser.
5. Switching from an image-history chat to a text-only model prompts for a new
   chat or otherwise prevents incompatible history from being sent.

Result table:

```markdown
| Model | Label OK | Image gate OK | PDF QA | Tool UI | No raw markup | Follow-up | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `model/id` | pass/fail | pass/fail | pass/fail | pass/fail | pass/fail | pass/fail | ... |
```

If browser automation cannot complete a local file chooser, record only that
image-upload subcheck as residual risk; still verify button gating and
image-history switching.

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
- Switching provider/model does not leave stale quick-action state stuck on
  `Generating...`.

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
- Enroll documents do not accidentally write to the user's personal document
  list without the task association.

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
- Enrolled and self-created documents are not mixed in task submission tables.

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

## Phase H: Browser Resilience Edges

Goal: the browser experience survives common user behavior.

Steps:

1. Hard refresh a document page.
2. Navigate away and back.
3. Open the same document in a second tab if practical.
4. Start an AI response, then cancel or navigate away.
5. Upload an invalid file type where upload UI is available.
6. Let a token expire or log out in another tab if practical.

Expected:

- No infinite spinner after cancellation/navigation.
- Invalid upload shows bounded error.
- Auth expiry returns to login or reauth path cleanly.
- No stale AI/tool/reasoning state leaks into the next turn.

## Failure Handling

For every confirmed product failure:

1. Reproduce once more unless destructive.
2. Search issues/PRs and `docs/REGRESSION_LEDGER.md`.
3. Classify using `docs/REGRESSION_GUARD.md`.
4. Create a Kordi-style issue.
5. Fix with the smallest coherent branch.
6. Add or name the regression lock.
7. Rerun the failed phase and one adjacent happy path.
