# Editions: Post-Refactor Work Order

**Status:** editions refactor landed (integration PR #1050 + PolyForm license #1052);
deep review completed 2026-07-14 — see findings below.
**Audience:** implementation agent (Codex). Self-contained; do not assume chat context.

## Deep-review verdict (2026-07-14)

The edition seam is sound and matches industry practice. Verified:

- `packages/backend/src/app.ts`: `hasFeature` gate, injectable `loadBillingModule`
  (testable), dynamic import via variable (community runtime never resolves
  `@humanly-ee/billing`), explicit 404 for `/api/v1/billing` in community.
- Frontend: build-time webpack alias `@humanly-edition/billing-ui` swaps between
  `ee/packages/billing/src/writer.tsx` (cloud) and a community stub — EE UI is
  physically absent from community bundles; runtime `notFound()` double-guards.
- `scripts/run-migrations.sh`: colon-separated multi-dir with duplicate-filename guard.
- CI: edition matrix, `community-boundary.mjs` (forbidden production paths),
  `assert-edition-image.sh` (image purity per edition).
- `ee/LICENSE` = PolyForm Free Trial 1.0.0 (real, unmodified license — good choice).
- No Stripe/paid references outside `ee/`; no build artifacts tracked in git.

**Findings to address (ordered):**

1. **Production still runs pre-editions code.** `humanly-cloud`'s `community.lock`
   pins `67555e75` (before #1050). The Cloud-edition deploy PR (humanly-cloud #11)
   is `CONFLICTING` against its own main (which gained #8 immutable runtime and
   #10 migration params after the branch). → Task 1.
2. **Publisher billing UI is exported but unwired.** `ee/packages/billing` exports
   `./publisher` (`publisher.tsx`), but `packages/frontend` (admin) has no
   `@humanly-edition/*` alias. Either wire the admin alias + gated page (mirroring
   frontend-user) or delete the export until needed. Small, but a dangling seam.
3. **`ee/docker/*.Dockerfile` duplication drift.** The three cloud Dockerfiles are
   near-copies of `docker/*.Dockerfile`. Add a comment header in both pointing at the
   counterpart, and a CI reminder (e.g., checksum-diff warning) or accept the drift
   risk consciously.

## Boundary decisions (settled — do not relitigate)

**Auth, password reset, and email stay in Community.** Verified current design is
already correct and must be preserved:

- `email.service.ts` is provider-config-driven (`EMAIL_SERVICE=console|sendgrid|smtp`
  with production guards). Self-hosters bring their own SMTP; the SendGrid account is
  Cloud *configuration* (lives in the infra repo), not Cloud *code*.
- OAuth (`oauth.service.ts`, Google + GitHub) is credential-config-driven; the backend
  reports available providers via `/auth/oauth/providers` and the login page renders
  buttons only for configured ones. A self-host without Google credentials gets
  email+password automatically. Self-hosters may bring their own OAuth client IDs.
- Why OpenHands differs: OpenHands' OSS build is a **single-user local tool with no
  accounts**, so their `enterprise/` contains the entire multi-user SaaS server
  (OAuth, SMTP, billing, orgs). Humanly Community **is** a multi-user server
  (instructor/student flows are the paper's core use case) — auth/email are core
  product, not SaaS extras. We copy OpenHands' repo mechanics, not their feature split.

**The edition boundary is a commercial-value boundary, not a deployment boundary.**
Deployment differences (which SMTP, which OAuth client, which hostnames) are env
config in the infra repo. Candidates for future `ee/` features: enterprise SSO
(SAML/OIDC/SCIM), plan/quota enforcement, team/org workspaces, cross-tenant admin
analytics, managed AI model pool. Not candidates: auth, email, storage adapters
(local/GCS are both config-driven), rate limiting, tracker, certificates, detector
framework.

## Tasks

### Task 1 — Land Cloud-edition deploy in the infra repo (highest priority)
In `Humanly-Lab/humanly-cloud` (to be renamed, Task 3):
1. Rebase PR #11 (`feat/1043-cloud-edition-deploy`) onto current main, resolving
   conflicts against #8 (immutable runtime) and #10 (migration params). If the rebase
   is messier than re-authoring, close #11 and recreate from main.
2. Advance `community.lock` to a post-refactor revision (`d500df8f` or later).
3. Build images from the pinned revision using `ee/docker/*.Dockerfile`
   (`EDITION=cloud`, `NEXT_PUBLIC_EDITION=cloud`); reuse
   `scripts/ci/assert-edition-image.sh` from the product repo as a deploy-time gate.
4. Deploy; verify health reports `edition: "cloud"` and `GET /api/v1/billing/plan`
   responds. Verify the Community quickstart still boots independently
   (`edition: "community"`).

### Task 2 — Wire or remove the publisher billing seam (finding 2)

### Task 3 — Rename `humanly-cloud` → `humanly-cloud-infra`
After Task 1 lands (avoid renaming under an open conflicted PR). GitHub redirects,
but update explicit references: VM git remote, workflow references, docs in both repos.

### Task 4 — `ee/LICENSE` final read-through (maintainer)
PolyForm Free Trial 1.0.0 replaced the placeholder — better than homemade. Maintainer
gives it one final read (notably the 32-day trial term) and confirms it matches the
pricing-page story.

### Task 5 — Documentation upkeep
- Keep `docs/EDITIONS_REFACTOR_PLAN.md` as the boundary record (already updated).
- `docs/EDITIONS_DEVELOPMENT.md` is the developer guide for edition work — update it
  whenever the seams (registry, alias, CI checks) change.
- README "Editions" section and `docs/SELF_DEPLOY.md` describe Community accurately.

### Task 6 — Directory naming (settled: keep `ee/`)
`enterprise/` was considered and rejected: "Enterprise" is a specific pricing tier
while `ee/` hosts all paid features (including Pro-tier billing), and `ee` is the
majority convention (GitLab, PostHog, Cal.com, n8n).

## Standing guardrails

- Community remains fully usable multi-user (auth, email via SMTP, certificates,
  detector framework); README/paper claims stay true.
- `packages/*` never imports `ee/` (CI-enforced).
- No secrets or managed-production topology in this repo.
- All product code lives here; the infra repo carries deployment only.
