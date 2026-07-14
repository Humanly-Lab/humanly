# Editions Refactor Plan: Humanly Community + Humanly Cloud

**Status:** implemented architecture; maintained as the edition-boundary record
**Owner:** @ShenzheZhu
**Audience:** implementation agent (Codex). This document is self-contained; do not assume other context.

---

## 1. Goal

Ship two editions from **one codebase** in this repository:

| | Humanly Community | Humanly Cloud |
|---|---|---|
| License | MIT (everything outside `ee/`) | PolyForm Free Trial License 1.0.0 (`ee/` only) |
| Distribution | Self-hosted (quickstart / SELF_DEPLOY) | Managed SaaS at writehumanly.net, deployed from `Humanly-Lab/humanly-cloud` |
| Code visibility | Public | **Public (source-available)** — visible in this repo, paid to use |

Model to imitate: **OpenHands** (MIT repo, `enterprise/` directory source-available under a paid license) and **PostHog** (MIT repo, `ee/` directory under `ee/LICENSE`). Anti-goal: the pre-2019 GitLab setup (two repos, EE forked from CE) — GitLab abandoned it because of constant merge conflicts and release desync; we will not maintain cloud application code in a second repo.

The `Humanly-Lab/humanly-cloud` repo **stays deploy-only** (compose files, nginx, deploy workflow, secrets, private artifacts such as model weights). Recent PRs #1034/#1035/#1037 already moved managed-production infra there. No application code lives in humanly-cloud.

## 2. Feature policy (what goes where)

| Feature | Community | Cloud | Mechanism |
|---|---|---|---|
| Writing environment, tracking, certificates, replay, anomaly-pattern detector | ✅ | ✅ | stays in `packages/*` (MIT) |
| Typing-detector **framework** (interfaces, config keys, `packages/inference` service) | ✅ (bring-your-own inference endpoint) | ✅ | stays MIT — the paper describes this component; the OSS release must keep it |
| Typing-detector **managed model** (Humanly-hosted weights + serving) | ❌ | ✅ | weights/serving config live in humanly-cloud; `ee/` carries the managed-client glue |
| Billing (Stripe, plans, usage limits) | ❌ | ✅ | new `ee/packages/billing` |
| Managed-hosting glue (multi-tenant config, hostname audit exceptions) | ❌ | ✅ | `ee/` + humanly-cloud |

Rule of thumb: **interfaces and defaults in MIT core; paid implementations in `ee/`; secrets and weights in humanly-cloud.**

## 3. Target layout

```
humanly/
├── LICENSE                      # MIT, amended: "except the ee/ directory"
├── packages/                    # existing 8 packages, MIT, unchanged locations
├── ee/
│   ├── LICENSE                  # PolyForm Free Trial 1.0.0 (source-available)
│   ├── README.md                # what ee/ is, pointer to pricing
│   ├── packages/
│   │   └── billing/             # first EE package: @humanly-ee/billing
│   └── migrations/              # cloud-only SQL migrations
└── pnpm-workspace.yaml          # adds "ee/packages/*"
```

Package namespace: `@humanly-ee/*`. EE packages may depend on `@humanly/*`; **`packages/*` must never import from `ee/`** (enforced in CI, see Phase 5).

## 4. Edition switch

- Backend: env `EDITION=community|cloud` (default `community`).
- Frontends: build arg / env `NEXT_PUBLIC_EDITION=community|cloud` (default `community`). Passed as a Docker build arg like the existing `NEXT_PUBLIC_API_URL`.
- Shared registry in `@humanly/shared` (new file `packages/shared/src/config/edition.ts`):

```ts
export type Edition = 'community' | 'cloud';
export type EditionFeature = 'billing' | 'managedTypingDetector';

const EDITION_FEATURES: Record<Edition, readonly EditionFeature[]> = {
  community: [],
  cloud: ['billing', 'managedTypingDetector'],
};

export const normalizeEdition = (v: string | undefined | null): Edition =>
  v === 'cloud' ? 'cloud' : 'community';

export const hasFeature = (edition: Edition, f: EditionFeature): boolean =>
  EDITION_FEATURES[edition].includes(f);
```

All gating anywhere in the stack goes through `hasFeature` — no ad-hoc `process.env.EDITION` checks outside the two entry points that read the env once.

## 5. Implementation phases (one PR each)

### Phase 0 — Licensing and scaffold
1. Amend root `LICENSE`: keep MIT text, prepend a scope note: *"This license applies to all content of this repository **except** the `ee/` directory, which is licensed under `ee/LICENSE`."* (Match PostHog's LICENSE wording style.)
2. Create `ee/LICENSE` using the unmodified PolyForm Free Trial License 1.0.0.
   The standard license permits evaluation for less than 32 consecutive
   calendar days; use outside its terms requires a separate commercial license.
3. Create `ee/README.md` (edition explanation + link to /pricing).
4. Add `ee/packages/*` to `pnpm-workspace.yaml`.
5. README.md: add an "Editions" section (Community vs Cloud table, licensing note).

**Accept:** `pnpm install` still green; repo licensing is unambiguous; no behavior change.

### Phase 1 — Edition registry in shared
1. Add `packages/shared/src/config/edition.ts` as in §4; export from shared index.
2. Unit tests for `normalizeEdition` / `hasFeature`.

**Accept:** `pnpm --filter @humanly/shared build && test` green; no consumer changes yet.

### Phase 2 — Backend gating
1. Read `EDITION` once at startup (config module), expose via existing config pattern.
2. In `packages/backend/src/app.ts`, register EE routes conditionally with **dynamic import** so a community build/runtime never requires `ee/` to be present:
   ```ts
   if (hasFeature(edition, 'billing')) {
     const { registerBillingRoutes } = await import('@humanly-ee/billing');
     registerBillingRoutes(app);
   }
   ```
3. Migrations: cloud-only SQL lives in `ee/migrations/`. `scripts/run-migrations.sh` already accepts `MIGRATIONS_DIR`; extend it to accept a colon-separated list (`MIGRATIONS_DIR="packages/backend/src/db/migrations:ee/migrations"` for cloud). Community default unchanged.
4. Expose edition in the health endpoint payload (`edition: 'community'`) for ops visibility.

**Accept:** community boots with no `ee/` packages installed (verify by temporarily removing `ee/` in CI); cloud boots with billing routes mounted; migration script applies both dirs in cloud mode.

### Phase 3 — Frontend gating
1. Plumb `NEXT_PUBLIC_EDITION` through both Next.js apps (frontend, frontend-user); helper `getEdition()` in each app's lib reading the env once.
2. Gate EE UI behind `hasFeature(...)`; use literal `process.env.NEXT_PUBLIC_EDITION` comparisons at the branch site so Next.js dead-code-eliminates EE component imports from community bundles.
3. Establish the UI pattern for gated features: **hidden entirely in community** (no upsell teasers inside the product for now — marketing/pricing pages already communicate editions).

**Accept:** community bundle contains no EE component code (`grep` the `.next` output for an EE-only marker string); cloud build renders the gated nav/pages.

### Phase 4 — First EE package: `@humanly-ee/billing` (walking skeleton)
Prove the seam end-to-end with a minimal package:
1. `ee/packages/billing/` — `package.json` (name `@humanly-ee/billing`, license field pointing at `ee/LICENSE`), `src/index.ts` exporting `registerBillingRoutes(app)` with a stub `GET /api/v1/billing/plan` returning the current plan (`free`), and one `ee/migrations/9000-billing-schema.sql` placeholder table.
2. Frontend-user: a gated `/settings/billing` stub page (cloud only).
3. Stripe integration is **out of scope** for this phase — the goal is the wiring, not the billing product.

**Accept:** cloud build serves the stub route + page; community build has neither; typecheck green in both editions.

### Phase 5 — CI matrix and purity guards
1. Extend `.github/workflows/ci.yml` (jobs: script-audit, lint, typecheck, test-runnable) to a **matrix over `EDITION=community|cloud`** for typecheck + tests; lint once.
2. Add a **boundary lint**: fail CI if anything under `packages/` imports from `ee/` (simple grep or eslint no-restricted-imports).
3. Add a **community purity check**: build the community Docker images and assert `ee/` content is absent from the image filesystem and bundles.
4. Docker: community Dockerfiles do not `COPY ee/`; add cloud build args (`EDITION=cloud`) — the cloud deploy workflow in humanly-cloud consumes them.
5. Tag/release convention: single version tag per release; images published as `humanly-*:<version>` (community) and `humanly-*:<version>-cloud`.

**Accept:** PRs run both editions; a `packages/ → ee/` import breaks CI; community image is provably ee-free.

## 6. Guardrails

- **Never regress Community.** Community must remain a genuinely usable product (writing env, tracking, certificates, anomaly-pattern detector, BYO-endpoint typing detector). The EMNLP paper and README describe the open-source release; their claims must stay true.
- **No secret code in this repo.** Anything that must stay private (model weights, tenant secrets, prod config) belongs in humanly-cloud or a private bucket — `ee/` is public.
- **One codebase, no forks.** If a change needs core + ee edits, it ships as one PR in this repo.
- **License changes require maintainer sign-off.** Keep the canonical PolyForm
  text unmodified; any future custom commercial terms require legal review.
- Keep the existing managed-hostname audit (from #1036/#1037) green: community sources must not reference managed-production hostnames; ee/ files are exempt.

## 7. Out of scope / later

- Stripe/actual billing product (Phase 4 only lays the wiring).
- A license-key/entitlement server for self-hosted *cloud* customers (OpenHands-style paid self-host). Initially, Cloud = deployed by us; entitlement is implicit.
- Marketing copy changes (pricing page already distinguishes editions).

## References

- GitLab, "Why we merged CE and EE into a single codebase": https://about.gitlab.com/blog/a-single-codebase-for-gitlab-community-and-enterprise-edition/
- PostHog LICENSE / ee/LICENSE: https://github.com/PostHog/posthog/blob/master/LICENSE
- OpenHands (MIT + source-available `enterprise/`): https://github.com/OpenHands/OpenHands/blob/main/LICENSE
- PolyForm Free Trial License 1.0.0: https://polyformproject.org/licenses/free-trial/1.0.0
- OCV licensing handbook: https://handbook.opencoreventures.com/startup-manual/fundamentals/licensing-and-distribution
