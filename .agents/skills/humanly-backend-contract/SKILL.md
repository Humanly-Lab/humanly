---
name: humanly-backend-contract
description: Use when validating Humanly backend API contracts, auth guards, document CRUD/events/statistics contracts, PDF file probes, AI settings token-budget contracts, or production/local API health with pnpm qa:backend:contract.
---

# Humanly Backend Contract

Use this skill for lightweight API contract checks before or after backend,
auth, document, file, event, or AI-settings changes.

## Core Command

```bash
pnpm qa:backend:contract
```

Default target is local backend `http://localhost:3001/api/v1`.

Remote target:

```bash
QA_BACKEND_BASE_URL=https://app.writehumanly.net/api/v1 pnpm qa:backend:contract
```

Mutating contract pass:

```bash
QA_BACKEND_MUTATING=1 pnpm qa:backend:contract
```

Optional PDF file probe:

```bash
QA_BACKEND_MUTATING=1 QA_BACKEND_FILE_PROBE=1 pnpm qa:backend:contract
```

## Rules

- Treat read-only default checks as safe for local or production.
- Use mutating mode only when account/document creation is acceptable.
- Do not print passwords, tokens, API keys, or raw per-user AI keys.
- Keep `QA_BACKEND_KEEP_DATA=1` only for debugging; otherwise let the harness
  clean up created data.
- If a contract fails, inspect the JSON and Markdown reports under
  `tmp/qa-runs/backend-contract/<run-id>/`.

## What It Covers

- Versioned health and API root metadata.
- Missing-token auth guard.
- Optional fresh user register/login.
- Optional document create/update/search/events/statistics flow.
- Optional small PDF upload/list/stream probe.
- AI settings fields: `shortcutMaxTokens`, `chatMaxTokens`, legacy aliases,
  invalid budget rejection, and masked key reads.

## References

- Modular QA map: `docs/testing/README.md`
- Harness source: `scripts/qa/backend-contract.mjs`
- Regression process: `docs/REGRESSION_GUARD.md`
