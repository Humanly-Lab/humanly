# Editions: Post-Refactor Work Order

**Status: COMPLETE — independently verified in production 2026-07-14.**
Infra PR #11 merged; `community.lock` advanced past the PolyForm swap (now
auto-advancing, at `c414771a`); production health reports `edition: "cloud"` and
`GET /api/v1/billing/plan` returns 200; `AI_ENCRYPTION_KEY` boot guard + tracker
hostname fix landed (#1054); repo renamed `humanly-cloud-infra` (#1055/#12);
Dockerfile cross-references (#1058); nullglob guard in `build-runtime-bundle.sh`.
Known follow-up nit: the AI-key guard rejects empty/all-zero keys but does not
enforce the 64-hex format its error message promises. Kept for history.
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

**Findings to address (ordered; updated after the line-level second pass):**

1. **Resolved: production now runs the Cloud edition.** Infra PR #11 was rebased
   with `community.lock` advanced past `d500df8f`, the Cloud images passed edition
   purity checks, and production health reports `edition: "cloud"` with the
   billing route mounted.
2. **Resolved: `AI_ENCRYPTION_KEY` production guard.** It previously had an
   all-zeros default with no production guard
   (`packages/backend/src/config/env.ts`). Email config has a production-boot
   validation pattern (`getEmailConfigurationErrors`); the encryption key — which
   protects user-owned AI provider keys at rest — now follows the same pattern and
   refuses production boot when unset or all-zero (#1054).
3. **Resolved: hardcoded managed hostname in Community-facing copy.**
   `packages/backend/src/controllers/tracker.controller.ts` (~line 425) tells
   admins where to open generated tracking-code instructions. It now derives the
   URL from `env.frontendAdminUrl`; the intentionally workflow-only hostname audit
   was not widened (#1054).
4. **`ee/docker/*.Dockerfile` duplication drift.** The three cloud Dockerfiles are
   near-copies of `docker/*.Dockerfile`. Add a comment header in both pointing at the
   counterpart, and a CI reminder (e.g., checksum-diff warning) or accept the drift
   risk consciously. Also: `build-runtime-bundle.sh` in the infra repo does
   `cp ee/migrations/*.sql` — fails if that directory is ever empty; guard the glob.

**Retracted:** an earlier draft flagged the publisher billing seam as unwired. It is
fully wired (`packages/frontend/next.config.js` aliases
`@humanly-edition/publisher-ui`, imported in the admin root layout); `publisher.tsx`
is intentionally a hidden marker component that the image-purity check greps for
(`HUMANLY_CLOUD_UI_MARKER`). No action needed.

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

### Task 1 — Land Cloud-edition deploy in the infra repo (completed)
In `Humanly-Lab/humanly-cloud-infra`:
1. Rebase PR #11 (`feat/1043-cloud-edition-deploy`) onto current main. The only
   conflict is the single-line `community.lock` (both sides moved it); everything
   else in the PR (ee dockerfiles, `-cloud` tags, edition env, ee-migrations bundle,
   composition guards) reviewed line-by-line and sound.
2. Resolve the lock conflict by advancing to `d500df8f` or later — NOT the PR's
   `23754da5`, which predates the PolyForm `ee/LICENSE` (finding 1).
3. Build images from the pinned revision using `ee/docker/*.Dockerfile`
   (`EDITION=cloud`, `NEXT_PUBLIC_EDITION=cloud`); reuse
   `scripts/ci/assert-edition-image.sh` from the product repo as a deploy-time gate.
4. Deploy; verify health reports `edition: "cloud"` and `GET /api/v1/billing/plan`
   responds. Verify the Community quickstart still boots independently
   (`edition: "community"`).

### Task 2 — Community hardening fixes (completed)
Production-boot guard for `AI_ENCRYPTION_KEY` (mirror the email-config pattern) and
replace the hardcoded `developer.writehumanly.net` in the tracker instructions with
the env-derived admin URL. One small PR in the product repo.

### Task 3 — Rename the Cloud control plane to `humanly-cloud-infra` (completed)
The GitHub repository, local checkout, and explicit references now use
`Humanly-Lab/humanly-cloud-infra`. The production VM has no checkout of the old
infra repository, so no VM remote required migration; its existing Git checkouts
correctly remain Community repositories.

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
