# Backend Stress Testing

Humanly's first reusable backend stress harness lives at
`scripts/backend-stress-test.mjs` and runs through:

- versioned backend health;
- register/login or supplied token auth;
- long document creation and updates;
- high-volume document event batches;
- document list/get/events/stats reads;
- synthetic PDF upload, indexing, listing, and streaming;
- expected rejection probes for `.docx`, `.md`, and `.pptx`.

The product is currently PDF-first for uploaded reference files. DOCX, Markdown,
and PPTX probes are intentionally expected to return HTTP 400 today. Adding
native ingestion for those formats is product work and should get its own issue.

## Local Run

Start the real backend track from `docs/LOCAL_DEV.md`, then run:

```bash
pnpm qa:stress:backend
```

Default target:

```text
http://localhost:3001/api/v1
```

Reports are written to:

```text
tmp/stress-runs/<run-id>/report.md
tmp/stress-runs/<run-id>/report.json
```

## Remote Or Production Run

Remote targets are automatically capped unless explicitly allowed:

```bash
STRESS_BASE_URL=https://api.writehumanly.net/api/v1 \
STRESS_ALLOW_REMOTE=1 \
STRESS_ROUNDS=2 \
STRESS_CONCURRENCY=2 \
pnpm qa:stress:backend
```

For existing users:

```bash
STRESS_BASE_URL=https://api.writehumanly.net/api/v1 \
STRESS_EMAIL=qa@example.com \
STRESS_PASSWORD='...' \
STRESS_EXISTING_USER=1 \
pnpm qa:stress:backend
```

Or skip auth entirely with a short-lived token:

```bash
STRESS_ACCESS_TOKEN='...' pnpm qa:stress:backend
```

Do not print passwords or tokens in issues, PRs, or final reports.

## Tunables

| Variable | Default | Meaning |
| --- | ---: | --- |
| `STRESS_ROUNDS` | `4` | Documents created. |
| `STRESS_CONCURRENCY` | `3` | Concurrent request workers. |
| `STRESS_EVENT_BATCH_SIZE` | `200` | Events per batch. |
| `STRESS_EVENT_BATCHES` | `2` | Event batches per document. |
| `STRESS_LONG_TEXT_KB` | `32` | Approx text size per document. |
| `STRESS_PDF_PAGES` | `5` | Synthetic PDF page count. |
| `STRESS_SKIP_UPLOADS` | `0` | Skip PDF/unsupported upload probes. |
| `STRESS_CLEANUP` | `0` | Delete created documents before exit. |
| `STRESS_OUTPUT_DIR` | `tmp/stress-runs/<run-id>` | Report directory. |

Flags can also be passed after `--`, for example:

```bash
pnpm qa:stress:backend -- --rounds=8 --concurrency=4 --pdf-pages=20
```

## Reading The Report

The harness exits non-zero when any unexpected request fails. Expected
unsupported-format 400s do not fail the run.

Report fields:

- status-code counts;
- global latency p50/p95/p99/max;
- per-phase request counts and latency;
- first failure samples with method/path/status;
- created document IDs and uploaded file IDs for cleanup or debugging.

## Production Safety

For production, start small. Recommended first run:

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
