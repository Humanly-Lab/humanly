# Modular QA Framework

Humanly QA is split into four layers. Run the layer that matches the risk of
the change instead of defaulting to one enormous regression pass.

## Layers

| Layer            | Entry Point                                                | Automation Level                                                       | Purpose                                                                                          |
| ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Backend contract | `pnpm qa:backend:contract` with `.agents/skills/humanly-backend-contract/SKILL.md` | Fully automated                                                        | API shape, auth guards, health, and future socket/provider-contract checks.                      |
| AI usage         | `pnpm qa:ai:usage` with `.agents/skills/humanly-ai-usage/SKILL.md` | Automated API/provider harness plus manual judgment for answer quality | Real model behavior, tool-call compatibility, grounded PDF QA, image gating, and provider drift. |
| Deploy smoke     | `pnpm qa:deploy:smoke` with `.agents/skills/humanly-deploy-smoke/SKILL.md` | Fully automated shallow checks                                         | Domains, TLS, app/admin proxy health, direct API health, and post-deploy surface reachability.   |
| Browser E2E      | `pnpm qa:browser:guide` then use `.agents/skills/humanly-browser-e2e/SKILL.md` and `BROWSER_E2E_PLAYBOOK.md` | Browser-agent-assisted manual QA                                       | User/admin flows that need visual/editor/browser judgment.                                       |
| Backend stress   | `pnpm qa:stress:backend` with `.agents/skills/humanly-backend-stress/SKILL.md` | Automated bounded stress harness                                      | Heavier document, event, upload, unsupported-format, and latency coverage.                       |

Existing detailed playbooks still matter:

- `docs/PRODUCTION_QA_PLAYBOOK.md` remains the full 14-phase production
  regression procedure.
- `docs/REGRESSION_GUARD.md` is mandatory when a phase finds a bug.
- `docs/BACKEND_STRESS_TESTING.md` covers load/file/event stress beyond the
  lightweight backend contract harness.

## When To Run What

| Change                                          | Required QA                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Pure docs/process                               | `git diff --check`; optional command `--help` checks.                                    |
| Backend API/auth/document logic                 | `pnpm qa:backend:contract`; targeted backend tests.                                      |
| AI prompt/tool/model/provider changes           | `pnpm qa:backend:contract` and `pnpm qa:ai:usage` with live provider execution.          |
| Frontend/editor/enroll visible UX               | Relevant automated tests plus the Browser E2E repo skill/playbook sections for the changed flow. |
| Model/provider UI, image capability labels, or model switching | Browser E2E Phase C2 focused AI model matrix plus relevant automated tests.              |
| Deployment, Docker, nginx, cert, or env changes | `pnpm qa:deploy:smoke`; then the short post-deploy canary in `docs/REGRESSION_GUARD.md`. |
| Release candidate                               | All four layers plus the full production playbook.                                       |

## Repo Skills

Codex repo skills live under `.agents/skills` and use the official
`SKILL.md` frontmatter shape. Use the smallest skill that matches the task:

| Skill | Use For |
| --- | --- |
| `.agents/skills/humanly-backend-contract/SKILL.md` | Lightweight backend/API/auth/document/file/AI-settings contract checks. |
| `.agents/skills/humanly-ai-usage/SKILL.md` | Provider/model/tool/image/app-level AI usage checks. |
| `.agents/skills/humanly-deploy-smoke/SKILL.md` | Deployment, TLS, proxy, static asset, and API reachability checks. |
| `.agents/skills/humanly-browser-e2e/SKILL.md` | Browser-agent-assisted user/admin flows and focused model matrix checks. |
| `.agents/skills/humanly-backend-stress/SKILL.md` | Heavier backend document/event/file stress probes. |
| `.agents/skills/humanly-regression-guard/SKILL.md` | Bug classification, recurring-risk checks, and regression reporting. |

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
- Network requests use a bounded timeout so a harness cannot hang forever.
  Override the default 30s timeout with `QA_FETCH_TIMEOUT_MS=<milliseconds>`
  when intentionally testing slow providers or long-running endpoints.
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

Detailed mutating pass:

```bash
QA_BACKEND_BASE_URL=https://app.writehumanly.net/api/v1 \
QA_BACKEND_MUTATING=1 \
pnpm qa:backend:contract
```

The mutating pass registers/logs in a QA user, creates a draft document, updates
it, writes representative focus/input/paste/blur events, reads events and
statistics, searches the document list, validates AI settings/token-budget
contracts, and deletes created document/settings data by default.

The AI settings checks verify:

- current fields: `shortcutMaxTokens` and `chatMaxTokens`;
- legacy compatibility: `responseMaxTokens` and `agentMaxTokens`;
- invalid budget rejection;
- public reads expose only masked key metadata, never the raw API key.

Optional PDF file probe:

```bash
QA_BACKEND_MUTATING=1 QA_BACKEND_FILE_PROBE=1 pnpm qa:backend:contract
```

Keep created data only when debugging:

```bash
QA_BACKEND_MUTATING=1 QA_BACKEND_KEEP_DATA=1 pnpm qa:backend:contract
```

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

Multiple models:

```bash
QA_AI_EXECUTE=1 \
QA_AI_PROVIDER=openrouter \
QA_AI_MODELS=qwen/qwen3.5-9b,anthropic/claude-sonnet-4.6 \
OPENROUTER_API_KEY=... \
pnpm qa:ai:usage
```

Optional provider image-input smoke for vision-capable models:

```bash
QA_AI_EXECUTE=1 \
QA_AI_IMAGE_EXECUTE=1 \
QA_AI_PROVIDER=openrouter \
QA_AI_MODELS=anthropic/claude-sonnet-4.6 \
QA_AI_IMAGE_MODELS=anthropic/claude-sonnet-4.6 \
OPENROUTER_API_KEY=... \
pnpm qa:ai:usage
```

This sends a generated red PNG through the OpenAI-compatible `image_url`
message shape and verifies the model identifies it as red. Keep text-only
models out of `QA_AI_IMAGE_MODELS`; capability gating in the browser/app layer
is covered by Browser E2E Phase C.

Token budget is configurable. Defaults are intentionally product-like enough
for reasoning-heavy models:

```text
QA_AI_SHORTCUT_MAX_TOKENS=1024
QA_AI_CHAT_MAX_TOKENS=4096
```

Override when diagnosing a model that spends most of its budget on reasoning:

```bash
QA_AI_EXECUTE=1 \
QA_AI_PROVIDER=openrouter \
QA_AI_MODELS=qwen/qwen3.5-9b \
QA_AI_SHORTCUT_MAX_TOKENS=2048 \
QA_AI_CHAT_MAX_TOKENS=8192 \
OPENROUTER_API_KEY=... \
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

Current live smoke checks:

- bounded text completion;
- OpenAI-compatible tool-call schema acceptance;
- pseudo-tool/DSML/XML/JSON markup leak detection in visible text;
- matrix expansion across configured models, document fixture classes, and
  query types.

Humanly app-level smoke:

```bash
QA_AI_APP_EXECUTE=1 \
QA_AI_APP_BASE_URL=https://app.writehumanly.net/api/v1 \
QA_AI_APP_PROVIDER_BASE_URL=https://api.together.xyz/v1 \
QA_AI_APP_MODEL=moonshotai/Kimi-K2.6 \
QA_AI_APP_API_KEY=... \
pnpm qa:ai:usage
```

This mode registers a transient user, saves AI settings, creates an AI-enabled
personal document, uploads a small generated PDF, runs a shortcut-style silent
chat, runs a grounded PDF chat question, verifies the final answer is non-empty
and free of pseudo-tool markup, checks the persisted tool-call trace, and then
deletes created data unless `QA_AI_APP_KEEP_DATA=1` is set.

Use `QA_AI_APP_REQUIRE_TOOL_CALL=0` only when diagnosing a provider/model that
answers correctly but fails to persist a structured tool-call trace; that should
be recorded as residual risk in the QA issue.

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

Current checks:

- app/admin root reachability;
- first Next.js static asset reachability;
- app/admin proxied `/api/v1/health`;
- direct API `/api/v1/health`;
- app/admin/direct API root metadata;
- app/admin/direct unauthenticated auth guard.

## Browser E2E

Browser E2E is not a CI-style unattended test today. Use:

```bash
pnpm qa:browser:guide
```

This writes a normal QA report and a reusable phase packet:

```text
tmp/qa-runs/browser-guide/<run-id>/report.md
tmp/qa-runs/browser-guide/<run-id>/phase-packet.md
```

You can scope it to specific browser phases:

```bash
QA_BROWSER_TARGET=production QA_BROWSER_PHASES=C,C2,D pnpm qa:browser:guide
```

Then use `.agents/skills/humanly-browser-e2e/SKILL.md` and follow
`docs/testing/BROWSER_E2E_PLAYBOOK.md` with the Codex browser agent or a human
tester, posting one phase-packet section per QA control issue comment. Convert
stable findings into lower-level regression locks when possible.

For model/provider UI changes, run the focused Phase C2 matrix. Its detailed
reference lives at:

```text
.agents/skills/humanly-browser-e2e/references/ai-model-matrix.md
```

The browser guide includes a phase report template. Use one issue comment per
phase so long runs can be resumed and audited without relying on chat memory.
