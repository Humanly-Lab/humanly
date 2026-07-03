---
name: humanly-deploy-smoke
description: Use when validating Humanly production or staging deployment health, app/admin root reachability, Next.js static assets, proxied API health, direct API TLS/hostname behavior, and unauthenticated auth guards with pnpm qa:deploy:smoke.
---

# Humanly Deploy Smoke

Use this skill after deploy, TLS/proxy/nginx/Docker/workflow changes, or when a
production surface may be unreachable.

## Core Command

```bash
pnpm qa:deploy:smoke
```

Custom targets:

```bash
QA_APP_BASE=https://app.writehumanly.net \
QA_ADMIN_BASE=https://admin.writehumanly.net \
QA_DIRECT_API_BASE=https://api.writehumanly.net/api/v1 \
pnpm qa:deploy:smoke
```

When intentionally testing only app/admin proxy paths:

```bash
QA_DEPLOY_REQUIRE_DIRECT_API=0 pnpm qa:deploy:smoke
```

## Rules

- Direct API TLS/health is critical by default because `api.writehumanly.net` is
  a supported public hostname.
- Downgrade direct API only for a scoped run, and record the residual risk.
- This harness is shallow. It proves surfaces are reachable, not that user/admin
  workflows are correct.
- Follow with Browser E2E or AI usage when product behavior is in scope.

## What It Covers

- User portal root reachability.
- Admin portal root reachability.
- First Next.js static asset reachability.
- App/admin proxied `/api/v1/health`.
- Direct API `/api/v1/health`.
- App/admin/direct API root metadata.
- App/admin/direct unauthenticated auth guard.

## References

- Modular QA map: `docs/testing/README.md`
- Deployment notes: `docs/PRODUCTION_DEPLOYMENT.md`
- Harness source: `scripts/qa/deploy-smoke.mjs`
- Regression process: `docs/REGRESSION_GUARD.md`
