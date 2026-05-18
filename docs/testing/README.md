# Modular QA Framework

Humanly QA is split into four layers. Run the layer that matches the risk of
the change instead of defaulting to one enormous regression pass.

## Layers

| Layer | Entry Point | Automation Level | Purpose |
| --- | --- | --- | --- |
| Backend contract | `pnpm qa:backend:contract` | Fully automated | API shape, auth guards, health, and future socket/provider-contract checks. |
| AI usage | `pnpm qa:ai:usage` | Automated API/provider harness plus manual judgment for answer quality | Real model behavior, tool-call compatibility, grounded PDF QA, image gating, and provider drift. |
| Deploy smoke | `pnpm qa:deploy:smoke` | Fully automated shallow checks | Domains, TLS, app/admin proxy health, direct API health, and post-deploy surface reachability. |
| Browser E2E | `pnpm qa:browser:guide` then follow `BROWSER_E2E_SKILL.md` | Browser-agent-assisted manual QA | User/admin flows that need visual/editor/browser judgment. |

Existing detailed playbooks still matter:

- `docs/PRODUCTION_QA_PLAYBOOK.md` remains the full 14-phase production
  regression procedure.
- `docs/REGRESSION_GUARD.md` is mandatory when a phase finds a bug.
- `docs/BACKEND_STRESS_TESTING.md` covers load/file/event stress beyond the
  lightweight backend contract harness.

## When To Run What

| Change | Required QA |
| --- | --- |
| Pure docs/process | `git diff --check`; optional command `--help` checks. |
| Backend API/auth/document logic | `pnpm qa:backend:contract`; targeted backend tests. |
| AI prompt/tool/model/provider changes | `pnpm qa:backend:contract` and `pnpm qa:ai:usage` with live provider execution. |
| Frontend/editor/enroll visible UX | Relevant automated tests plus `BROWSER_E2E_SKILL.md` sections for the changed flow. |
| Deployment, Docker, nginx, cert, or env changes | `pnpm qa:deploy:smoke`; then the short post-deploy canary in `docs/REGRESSION_GUARD.md`. |
| Release candidate | All four layers plus the full production playbook. |

## Report Schema

Every command-line harness writes:

```text
tmp/qa-runs/<layer>/<run-id>/report.json
tmp/qa-runs/<layer>/<run-id>/report.md
```

The shared schema is `humanly.qa.report.v1`:

```json
{
  "schemaVersion": "humanly.qa.report.v1",
  "run": {
    "id": "backend-contract-20260517T230000Z",
    "layer": "backend-contract",
    "title": "Backend Contract Harness",
    "startedAt": "...",
    "completedAt": "..."
  },
  "config": {},
  "summary": {
    "status": "pass",
    "total": 4,
    "passed": 3,
    "failed": 0,
    "warned": 0,
    "skipped": 1,
    "failedCritical": 0,
    "failedNonCritical": 0
  },
  "checks": [
    {
      "id": "health",
      "title": "Versioned health endpoint returns ok",
      "target": "http://localhost:3001/api/v1/health",
      "critical": true,
      "status": "pass",
      "durationMs": 42,
      "details": {},
      "error": null
    }
  ]
}
```

Rules:

- Critical `fail` exits non-zero.
- Non-critical failures and warnings keep the run usable but must be called out
  in the PR/issue.
- Secrets are represented only as booleans such as `hasApiKey`; never write API
  keys, tokens, or passwords into reports.
- Browser E2E reports live in the QA control issue because screenshots and
  visual observations are browser-agent artifacts, not stable JSON checks.

## Backend Contract

Default run:

```bash
pnpm qa:backend:contract
```

Default target:

```text
http://localhost:3001/api/v1
```

Remote target:

```bash
QA_BACKEND_BASE_URL=https://app.writehumanly.net/api/v1 pnpm qa:backend:contract
```

Mutating auth checks are opt-in:

```bash
QA_BACKEND_MUTATING=1 pnpm qa:backend:contract
```

Use this harness for low-level API contract checks. Keep higher-volume event,
upload, and latency work in `pnpm qa:stress:backend`.

## AI Usage

Plan-only run:

```bash
pnpm qa:ai:usage
```

Live provider smoke:

```bash
QA_AI_EXECUTE=1 \
QA_AI_PROVIDER=together \
QA_AI_MODEL=moonshotai/Kimi-K2.6 \
TOGETHER_API_KEY=... \
pnpm qa:ai:usage
```

The baseline matrix manifest lives at:

```text
fixtures/qa/ai-usage/manifest.json
```

Future detailed AI usage work should extend this harness with document upload,
question generation, tool trace capture, model-specific judgment, and UI chat
canaries. Do not create another one-off AI runner unless this harness cannot be
extended cleanly.

## Deploy Smoke

Production defaults:

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

Direct API TLS/health is critical by default because `api.writehumanly.net` is a
supported public hostname. If a product UI pass intentionally relies only on
app/admin proxy paths, downgrade direct API to a warning for that specific run:

```bash
QA_DEPLOY_REQUIRE_DIRECT_API=0 pnpm qa:deploy:smoke
```

## Browser E2E

Browser E2E is not a CI-style unattended test today. Use:

```bash
pnpm qa:browser:guide
```

Then follow `docs/testing/BROWSER_E2E_SKILL.md` with the Codex browser agent or
a human tester. Convert stable findings into lower-level regression locks when
possible.
