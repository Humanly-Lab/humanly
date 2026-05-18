# Regression Guard

This guide is the soft QA layer for Humanly. It is deliberately lighter than a
full browser automation harness, but stricter than ad-hoc manual testing.

The goal is simple:

- Old bugs should not silently return.
- New bug reports should say why they are truly new.
- Provider, infra, and test-harness problems should not be mislabeled as app
  logic bugs.
- Every product bug fix should leave a regression lock behind.

Use this with `docs/PRODUCTION_QA_PLAYBOOK.md`.

All confirmed bug issues must follow `docs/ISSUE_AUTHORING_GUIDE.md`. The
required standard is Kordi-style: problem, expected behavior, repro, suspected
failure path, scope, acceptance criteria, out-of-scope boundaries, file
pointers, and references. Do not file one-paragraph placeholder bugs.

## Required Classification

Every confirmed QA finding must use one primary classification:

| Classification | Meaning | Required evidence |
| --- | --- | --- |
| `type:regression` | A previously fixed or previously passing behavior failed again. | Link the prior issue/PR and name the missing or failing regression lock. |
| `type:old-gap` | The bug likely existed already, but earlier QA did not cover that path. | Explain which phase/checklist gap allowed it through. |
| `type:new-bug` | The bug was introduced by a recent feature/change and does not match the ledger. | Link the likely recent PR or changed subsystem. |
| `type:provider` | External AI/provider/account behavior: rate limit, 503, model contract drift, credit exhaustion. | Include provider, model, status/error, and whether app degradation was acceptable. |
| `type:infra` | DNS, TLS, deploy, CORS, object storage, VM, cert, environment, or domain-policy issue. | Include host/path and whether product proxy paths still work. |

If unsure, use `type:old-gap` until proven otherwise. Do not call something
`type:new-bug` just because it was found today.

## Before Filing A Bug

Run this sequence:

1. Reproduce the behavior at least twice, unless it is data-destructive or
   security-sensitive.
2. Capture the exact surface:
   - UI URL or API endpoint.
   - User role.
   - Mode: personal document or enroll task.
   - Provider/model, if AI-related.
   - Expected vs actual result.
3. Search existing issues and recent PRs:

```bash
gh issue list --repo ShenzheZhu/humanly --state all --search "<keyword>"
gh pr list --repo ShenzheZhu/humanly --state all --search "<keyword>"
```

4. Check `docs/REGRESSION_LEDGER.md` for matching symptoms.
5. Decide classification.
6. If it is `type:regression`, identify the regression lock that failed or was
   missing.
7. File the issue only after the classification is known.

## Bug Issue Template

Use `docs/ISSUE_AUTHORING_GUIDE.md` as the canonical template. At minimum,
confirmed QA bugs must include this regression-specific block:

```markdown
## Classification
type:regression / type:old-gap / type:new-bug / type:provider / type:infra

## Summary
One sentence.

## Repro
1. Role/account type:
2. URL or endpoint:
3. Steps:

## Expected

## Actual

## Prior Art Check
- Related old issue/PR:
- Ledger row:
- Why this is or is not a regression:

## Regression Lock Required
- Unit/API/UI/build/provider-smoke/doc-only:
- Proposed test or reason automation is not practical:
```

## Fix Requirements

Every product bug fix needs a regression lock in the same PR.

Preferred order:

1. Unit test for pure logic.
2. Backend service/controller/integration test for API behavior.
3. Frontend component/workflow test for UI state logic.
4. Build gate for build/config/type drift.
5. Provider smoke script check for provider-specific contracts.
6. Documentation-only lock only when automation is impractical; explain why.

If a bug requires manual UI retest, still add a lower-level lock whenever
possible. Example: a real browser shortcut bug can have a component keyboard
event test plus a manual QA checklist entry.

## Retest Requirements

Do not close a bug after CI alone. For product bugs:

- Confirm the original failing path now passes.
- Confirm a nearby path still passes.
- Confirm production deploy succeeded if the bug was found on production.
- Update the control QA issue with concrete evidence.
- Update `docs/REGRESSION_LEDGER.md` if the bug creates a new recurring risk.

## Release Confidence Stack

Humanly uses layered confidence, not one enormous brittle UI harness:

1. `pnpm test` for unit/service/component workflow coverage.
2. `pnpm build:all` in CI to catch type/build drift.
3. `pnpm qa:backend:contract` for lightweight API contract checks.
4. `pnpm qa:ai:usage` for real provider/model behavior.
5. `pnpm qa:deploy:smoke` for deployment, TLS, proxy, and health surfaces.
6. `.agents/skills/humanly-browser-e2e/SKILL.md` plus
   `docs/testing/BROWSER_E2E_PLAYBOOK.md` for browser-agent-assisted
   human-visible flows.
7. Post-deploy canary: a short human or agent-run smoke on app/admin.

## UI Automation Boundary

Do not promise full unattended UI automation for Humanly right now. The
high-value UI checks still require a browser agent or human tester because they
depend on real auth state, deployed domains, provider settings, editor
selection, uploads, and visual confirmation.

Treat UI QA as browser-agent-assisted manual evidence:

- Run the scripted phase checklist.
- Capture URLs, screenshots, console/network errors, and exact user role.
- Convert every stable app bug into a lower-level regression lock when possible.
- Keep brittle visual/browser steps in the playbook instead of pretending they
  are reliable CI gates.

## Post-Deploy Canary

After a main deploy with product changes, run this short smoke:

1. App and admin `/health` return 200.
2. User login and admin login work.
3. User opens a personal or task document.
4. One currently funded stable AI chat model answers one grounded PDF question
   (for example Together Kimi; OpenRouter Qwen is valid only when the
   OpenRouter account has credits; do not use Together Qwen).
5. When a funded vision-capable model is available, one image attachment turn
   works and non-vision models hide or refuse the image attachment path.
6. Four quick actions return selected-text rewrites only.
7. User submits an enrolled task document.
8. Admin submissions/analytics show the submission.
9. Public certificate verify page loads.

This does not replace the full 14-phase playbook; it catches obvious deploy
breakage quickly.

## When A Finding Is Not A Product Bug

Do not file a product bug for:

- Provider credit exhaustion.
- Provider 429/503 when the app surfaces a bounded, clear error.
- A manual QA harness mistake.
- A direct `api.writehumanly.net` product-flow failure when the tested UI path
  intentionally uses app/admin proxy paths. Direct API TLS/health failures are
  infra bugs because `api.writehumanly.net` is a supported public hostname.

Still record these in the QA control issue as caveats or residual risks.
