---
name: humanly-browser-e2e
description: Use when running Humanly browser-agent-assisted E2E QA for user/admin production or localhost flows, including auth, documents, AI chat, quick actions, enroll mode, admin dashboard, certificates, OpenRouter model matrix checks, image+text/text-only model switching, and regression reporting.
---

# Humanly Browser E2E

Use this skill for Humanly QA that needs real browser judgment: editor state,
visual AI activity, quick actions, enroll mode, admin dashboards, certificates,
model dropdown behavior, screenshots, and production/local navigation.

## Start

1. Read `docs/testing/README.md` to select the QA layer.
2. Read `docs/testing/BROWSER_E2E_PLAYBOOK.md` for the human-readable playbook.
3. Use `docs/REGRESSION_GUARD.md` before filing bugs.
4. Use `docs/ISSUE_AUTHORING_GUIDE.md` for every confirmed bug issue.
5. Never paste API keys, passwords, access tokens, or refresh tokens into
   issues, PRs, reports, screenshots, or final answers.

Run or inspect these before opening the browser unless the user explicitly
scopes the task to browser-only QA:

```bash
git status --short --branch
pnpm qa:deploy:smoke
pnpm qa:backend:contract
pnpm qa:ai:usage
```

If the user requests browser-only QA, record that scope in the QA issue and do
not imply backend/provider harnesses were run.

## Browser Tooling

- Use the Codex in-app browser for localhost and production pages.
- Use Chrome only when the user explicitly needs their Chrome profile,
  cookies, extensions, or an already-authenticated Chrome session.
- Capture URL, role, mode, provider/model, fixture, screenshot path, console
  errors, and network errors for failures.
- For export/download flows, verify the UI path and record when the user's local
  browser requires manual file confirmation.

## Phase Control

Keep one QA control issue for a full pass. Post one comment per phase so long
runs can be resumed and audited without relying on chat memory.

Core phases live in `references/browser-phases.md`:

- A: user auth
- B: personal document mode
- C: AI chat
- C2: focused AI model matrix
- D: quick actions
- E: enroll mode
- F: admin dashboard
- G: certificate and public verify
- H: browser resilience edges

Read `references/ai-model-matrix.md` when:

- adding, removing, renaming, or reclassifying models;
- changing image input support or labels;
- changing AI chat, reasoning, tool cards, provider settings, or model switching;
- reproducing provider-specific browser behavior.

## Failure Handling

For every confirmed product failure:

1. Reproduce once more unless destructive.
2. Search GitHub issues/PRs and `docs/REGRESSION_LEDGER.md`.
3. Classify with `docs/REGRESSION_GUARD.md`.
4. File a Kordi-style issue.
5. Fix with the smallest coherent branch.
6. Add or name the regression lock.
7. Rerun the failed phase and one adjacent happy path.

Do not claim "no bugs" after partial browser coverage. State the exact phases,
models, files, and roles covered.
