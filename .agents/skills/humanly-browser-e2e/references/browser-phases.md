# Browser E2E Phases

Use one QA issue comment per phase. Split large phases into multiple comments
instead of writing a single end-of-run memory dump.

## Phase Report Template

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
- Final answer is non-empty and bounded.
- Raw DSML/XML/JSON pseudo tool markup does not leak into the final message.
- Reasoning is shown separately from the final answer.
- Model switching does not break subsequent turns.
- Image input is hidden, refused, or handled according to model capability.

## Phase C2: Focused AI Model Matrix

Goal: provider/model browser behavior matches the curated model list and
capability labels.

Read `ai-model-matrix.md` for the model table, fixture, prompts, result table,
and residual-risk policy.

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
