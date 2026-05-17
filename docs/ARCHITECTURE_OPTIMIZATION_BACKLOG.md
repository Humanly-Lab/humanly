# Architecture And Performance Optimization Backlog

This document is the parking lot for optimization work discovered during the
full production QA pass. It separates safe implementation candidates from
larger architecture choices that need owner input.

## Current System Shape

- Single GCP VM running Docker Compose.
- Nginx fronts `app.writehumanly.net` and `admin.writehumanly.net`.
- App/admin proxy `/api`, `/health`, `/tracker/`, and `/socket.io/` to backend.
- PostgreSQL + TimescaleDB stores tracker `events` and editor
  `document_events`.
- Redis backs cache/session-adjacent behavior.
- Uploaded files are abstracted through the `files` table and storage adapters.
- AI provider configuration is per user and encrypted in DB.

## Safe Near-Term Optimizations

These are low-risk because they do not change product semantics.

### 1. Add Dashboard/Submission Query Indexes

Status: implemented in migration `027_analytics_query_indexes.sql`.

Why:

- Admin dashboard repeatedly joins task enrollments, sessions, submissions, and
  document events.
- Submission detail loads events by `session_id` and by unlinked
  `(document_id, user_id, created_at)` windows.
- Task submission completion needs the latest session for `(task_id,
  external_user_id)`.

Expected effect:

- Faster admin task list/detail, analytics sessions, submission replay, and the
  task-submit session-completion update.

### 2. Keep QA As A First-Class Release Gate

Status: implemented as `docs/PRODUCTION_QA_PLAYBOOK.md` and
`scripts/create-production-qa-issue.mjs`.

Why:

- Agentic AI, certificates, enroll mode, and admin analytics have cross-service
  behavior. A one-off smoke test misses regressions.

Expected effect:

- Lower release risk and better traceability across agents.

### 3. Fix Local Backend `tsc` Build Debt

Status: open residual #140.

Why:

- CI tests pass and production deploy works, but local backend build failure
  makes developer confidence worse and hides true type regressions.

Suggested approach:

- Add missing `@types/pg`.
- Type Express routers explicitly.
- Fix JWT `expiresIn` typing.
- Clean unused params/imports or relax no-unused where intentional.
- Make controller return paths explicit.

## Medium-Risk Improvements To Discuss

These are likely worthwhile but should be planned rather than silently slipped
into a QA docs PR.

### 1. Direct API TLS / Domain Policy

Residual issue: #105.

Decision needed:

- Should `api.writehumanly.net` be a supported public domain, or should all
  clients use app/admin proxied API paths?

If supported:

- Reissue TLS cert including `api.writehumanly.net`.
- Add direct API health checks to deploy verification.
- Confirm tracker snippets and CORS policy use the intended API base.

If not supported:

- Remove or de-emphasize direct API URLs from docs/config.
- Ensure snippets use app/admin or a deliberately supported API hostname.

### 2. Export Semantics

Residual issue: #141.

Decision needed:

- Should task export include user-portal `document_events`, legacy tracker
  `events`, or both?

Recommended direction:

- Export both with an `eventSource` field (`tracker` / `document`) and make the
  route live under `/api/v1/tasks/:taskId/export/*`.

### 3. File Storage And Retention

Context:

- The schema already supports GCS storage metadata.
- Older docs mention local storage and a past GCS follow-up.

Decision needed:

- Confirm production's desired canonical storage backend.
- Decide retention policy for uploaded PDFs, chat images, certificate JSON/PDF,
  and DB fallback image bytes.

Recommended direction:

- Use object storage for durable PDFs/images/certificate artifacts.
- Keep DB fallback only for small chat images and prune by age/size.
- Track object-storage health in production QA.

### 4. Analytics Materialization

Context:

- The admin dashboard computes task stats through joins across enrollments,
  sessions, events, document events, and submissions.
- Redis caches analytics summaries, but cache invalidation must stay correct.

Decision needed:

- Is the expected near-term volume small enough for indexed live queries, or do
  we need materialized task/user summary tables?

Recommended staged path:

1. Keep live queries plus indexes while traffic is low.
2. Add query-duration logging around analytics endpoints.
3. If P95 grows, add incremental summary tables updated on event ingestion and
   submission.

### 5. AI Provider Reliability

Context:

- The app now has hard timeouts/fallbacks.
- Low-RPM provider keys still make dense demos feel unreliable.

Decision needed:

- Should production offer only user-provided keys, platform-managed keys, or a
  hybrid?

Recommended direction:

- Keep curated stable model lists.
- Surface provider-rate errors clearly in UI.
- Add per-provider health metadata and model-specific disable flags.
- Consider a small server-side model catalog cache to reduce provider catalog
  calls.

## Long-Term Architecture Options

These are not immediate tasks.

- Move Postgres to Cloud SQL or another managed Postgres if VM operational risk
  becomes too high.
- Move Redis to Memorystore if cache/socket scaling requires it.
- Split backend worker responsibilities for PDF parsing and AI-heavy tasks.
- Add a background job queue for certificate PDF generation, PDF text extraction,
  and long-running export generation.
- Add observability: structured request IDs, endpoint latency histograms,
  provider latency/error metrics, and dashboard query timing.

