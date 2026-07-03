---
name: humanly-backend-stress
description: Use when stress testing Humanly backend document/event/file behavior, long text, high-volume event batches, synthetic PDF upload/list/stream, unsupported upload rejection, latency percentiles, or capped production stress with pnpm qa:stress:backend.
---

# Humanly Backend Stress

Use this skill for heavier backend/file/event/load coverage after the lightweight
backend contract harness is clean.

## Core Command

```bash
pnpm qa:stress:backend
```

Small production-safe probe:

```bash
STRESS_BASE_URL=https://api.writehumanly.net/api/v1 \
STRESS_ALLOW_REMOTE=1 \
STRESS_ROUNDS=1 \
STRESS_CONCURRENCY=1 \
STRESS_EVENT_BATCH_SIZE=50 \
STRESS_EVENT_BATCHES=1 \
STRESS_PDF_PAGES=2 \
STRESS_CLEANUP=1 \
pnpm qa:stress:backend
```

Scale only after a small run is clean.

## Rules

- Run `pnpm qa:backend:contract` first unless the user explicitly asks for
  stress only.
- Remote/prod targets are capped unless `STRESS_ALLOW_REMOTE=1` is set.
- Do not use high concurrency against production without explicit intent.
- Prefer `STRESS_CLEANUP=1` for production.
- Do not print passwords, bearer tokens, or raw created-user credentials.
- Expected unsupported-format 400s for `.docx`, `.md`, and `.pptx` are not
  product bugs while Humanly is PDF-first.

## What It Covers

- Health and auth.
- Long document create/update.
- High-volume event batches.
- Document list/get/events/stats reads.
- Synthetic PDF upload, indexing, listing, and streaming.
- Expected unsupported-format rejection probes.
- Latency p50/p95/p99/max and per-phase summaries.

## References

- Detailed guide: `docs/BACKEND_STRESS_TESTING.md`
- Harness source: `scripts/backend-stress-test.mjs`
- Modular QA map: `docs/testing/README.md`
- Regression process: `docs/REGRESSION_GUARD.md`
