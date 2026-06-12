# Regression Ledger

This ledger records bugs found during production QA that should not silently
reappear. It is not a replacement for tests; it tells future agents what to
search for before filing "new" bugs.

Update this file when a QA-discovered bug adds a reusable risk pattern.

## Recent QA Retrospective

The repeated "new bug after full QA" pattern was mostly not the same fixed bug
returning. It came from three different buckets:

| Bucket | Issues | What happened | Future guard |
| --- | --- | --- | --- |
| Old coverage gap | #117, #120, #121, #122, #124, #128, #136, #138, #140, #141 | The behavior already existed, but earlier QA did not touch that edge path or build surface. | Expand the playbook and add a lower-level regression lock when fixed. |
| Newly introduced app/provider behavior | #104, #110, #115 | A recent AI/editor/storage change created a real product bug. | Link the likely PR, add targeted tests, then retest the adjacent workflow. |
| Provider or infra contract drift | #105, #107, #126, #131, #133 | External provider/domain behavior changed or was slower/different than local assumptions. | Classify separately, verify app degradation is bounded, and keep provider smoke checks explicit. |

So a later QA pass finding more bugs is not automatically bad. It is bad only
when a closed ledger row returns without its regression lock catching it. Future
QA reports should name the bucket before filing the issue.

| Issue | Symptom | Classification | Fixed by | Regression lock |
| --- | --- | --- | --- | --- |
| #103 | Deployed AI model picker showed stale generic model list. | `type:old-gap` | #108 | Model whitelist tests and provider settings QA. |
| #104 | Quick actions could splice fallback text into selected text output. | `type:new-bug` | #106 | Quick-action fallback/output tests. |
| #105 | Direct `api.writehumanly.net` TLS certificate does not match hostname. | `type:infra` | #155 | Deploy cert-SAN guard plus post-deploy app/admin/api HTTPS health checks. |
| #107 | Non-streaming AI chat timed out with Together Qwen on personal document. | `type:provider` | #109 | REST chat reuses streaming agent path; AI smoke checks bounded behavior. |
| #110 | Uploaded chat image attachments returned file-not-found during vision chat. | `type:new-bug` | #111, #112, #113, #114 | Attachment ownership/storage fallback tests. |
| #115 | Agentic text chat returned empty final-answer fallback after multimodal history. | `type:new-bug` | #116 | AI chat completion selection tests. |
| #117 | Admin submission certificate links pointed to localhost in production. | `type:old-gap` | #118 | Certificate URL tests and admin submission certificate-link test. |
| #120 | Malformed JSON and invalid UUID-like params could return 500. | `type:old-gap` | #123 | Error-handler/integration negative tests. |
| #121 | PDF uploads accepted fake or empty `application/pdf` payloads. | `type:old-gap` | #123 | File/PDF validation tests. |
| #122 | Task export JSON/CSV endpoints returned 500 in production. | `type:old-gap` | #123 | Export service streaming tests; expanded by #141. |
| #124 | Real browser quick-action shortcuts did not trigger with shifted digit keys. | `type:old-gap` | #125 | Shortcut handling component/workflow tests plus manual browser check. |
| #126 | Quick actions could fail when provider stream returned no visible rewrite. | `type:provider` | #127 | Quick-action empty stream retry tests. |
| #128 | Admin task cards showed `0 docs / 0 logs` despite recorded submissions. | `type:old-gap` | #129 | Task card stats tests and admin dashboard QA. |
| #131 | Together `/models` returned top-level array, parsed as empty catalog. | `type:provider` | #132 | AI settings controller tests for array and `{ data }` catalogs. |
| #133 | AI chat could hang indefinitely on retrieval-heavy task questions. | `type:provider` | #134, #135 | Provider timeout and hard-timeout tests; QA checks bounded fallback. |
| #136 | Small reference-file QA over-relied on slow tool loops. | `type:old-gap` | #137 | Reference prefetch tests and grounded small-PDF smoke. |
| #138 | Task submissions did not mark submission sessions completed, causing 0% analytics completion. | `type:old-gap` | #139 | Task submission/session completion tests and analytics QA. |
| #140 | Local backend `tsc` build failed despite Jest passing. | `type:old-gap` | #145 | CI `pnpm build:all` gate. |
| #141 | Export route/docs mismatch and export omitted user-portal `document_events`. | `type:old-gap` | #145 | Export route integration test and export service document-event tests. |
| #170 | Together Kimi quick actions could return empty rewrites because the provider spent the response budget in reasoning unless thinking was disabled. | `type:provider` | #171 | Backend quick-action tests assert Together Kimi sends `chat_template_kwargs.enable_thinking=false`; post-deploy four-action quick-action canary. |
| #192 | Enrolled-task AI chat with no linked PDF could expose provider gibberish instead of a clear no-reference-files answer. | `type:provider` | current QA batch | No-reference chat preflight tests for REST and streaming paths. |
| #259 | Text-only AI follow-up after image history could fail with a provider corrupt-image error. | `type:regression` | current QA batch | Backend AI service tests downgrade corrupt historical image attachments and reject corrupt current image attachments before provider dispatch. |
| #261 | Auth forms could native-submit credentials into URL query params before React hydration. | `type:new-bug` | current QA batch | Auth form safety test asserts user/admin auth forms use a POST native fallback. |
| #262 | Admin task create/edit UI could not view or change the per-writing-session timer, and enrolled editors could hide that timer when AI usage limits used a non-time mode. | `type:old-gap` | current QA batch | Admin new-task/task-settings tests assert timer create, hydrate, export, and save payloads; frontend-user editor workflow tests assert `time.timeLimitSeconds` shows a writing timer independent of AI usage limit mode. |
| #363 | Buffered document activity events could be read too early by logs, certificate generation, or task submit when users acted immediately after typing. | `type:old-gap` | current QA batch | Frontend editor workflow tests assert View Logs, certificate generation, and task submit await activity-log flush success before continuing. |
| #441 | User-role tokens could access admin task owner endpoints and create/delete tasks through the admin API. | `type:old-gap` | current QA batch | Backend task route integration tests assert user-role tokens receive 403 on admin task endpoints while admin-role tokens and user enrollment routes still pass. |
| #443 | `DELETE /auth/me` could return 500 for users with task/public-writing dependent rows. | `type:regression` | current QA batch | Backend user-model deletion tests assert account deletion explicitly cleans Humanly app-owned dependent rows before deleting the user row; deployed QA retests public guest account deletion. |
| #554 | Public task guest documents hid the editor back button but still linked the navbar wordmark to `/documents`, giving guests a main workspace escape hatch. | `type:old-gap` | current QA batch | Frontend-user navbar tests assert regular users keep the wordmark workspace link while public task guests render a non-link wordmark. |

## How To Use

Before opening a new bug:

1. Search this table for the symptom.
2. If it matches a closed row, classify the finding as `type:regression`.
3. If it resembles a row but hits a new adjacent path, classify as
   `type:old-gap` and expand the regression lock.
4. If it involves provider model/catalog/rate behavior, classify as
   `type:provider` unless the app hangs, corrupts output, leaks secrets, or
   fails to surface a bounded error.

## Regression Lock Standards

A row is not complete unless it names a lock:

- Test file or test category.
- CI/build gate.
- Provider smoke script.
- Manual checklist item when automation is not practical.

If a bug returns, update the original row with the regression issue and explain
why the lock missed it.
