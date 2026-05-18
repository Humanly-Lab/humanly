---
name: humanly-ai-usage
description: Use when validating Humanly AI usage, provider/model compatibility, Together/OpenRouter smoke checks, tool-call schema behavior, DSML/XML/JSON markup leakage, image input support, token budgets, or Humanly app-level AI chat with pnpm qa:ai:usage.
---

# Humanly AI Usage

Use this skill for AI/provider/model behavior that can be checked below the full
browser layer.

## Modes

Plan-only matrix expansion:

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

Multiple OpenRouter models:

```bash
QA_AI_EXECUTE=1 \
QA_AI_PROVIDER=openrouter \
QA_AI_MODELS=qwen/qwen3.5-9b,anthropic/claude-sonnet-4.6 \
OPENROUTER_API_KEY=... \
pnpm qa:ai:usage
```

Provider image-input smoke:

```bash
QA_AI_EXECUTE=1 \
QA_AI_IMAGE_EXECUTE=1 \
QA_AI_PROVIDER=openrouter \
QA_AI_MODELS=anthropic/claude-sonnet-4.6 \
QA_AI_IMAGE_MODELS=anthropic/claude-sonnet-4.6 \
OPENROUTER_API_KEY=... \
pnpm qa:ai:usage
```

Shortcut-style reasoning-off smoke for reasoning-heavy models:

```bash
QA_AI_EXECUTE=1 \
QA_AI_DISABLE_REASONING=1 \
QA_AI_PROVIDER=openrouter \
QA_AI_MODELS=qwen/qwen3.5-9b,moonshotai/kimi-k2.6 \
OPENROUTER_API_KEY=... \
pnpm qa:ai:usage
```

Humanly app-level smoke:

```bash
QA_AI_APP_EXECUTE=1 \
QA_AI_APP_BASE_URL=https://app.writehumanly.net/api/v1 \
QA_AI_APP_PROVIDER_BASE_URL=https://api.together.xyz/v1 \
QA_AI_APP_MODEL=moonshotai/Kimi-K2.6 \
QA_AI_APP_API_KEY=... \
pnpm qa:ai:usage
```

## Token Budgets

Defaults:

```text
QA_AI_SHORTCUT_MAX_TOKENS=1024
QA_AI_CHAT_MAX_TOKENS=4096
```

Increase budgets when diagnosing reasoning-heavy models. Record the override in
the QA issue/report.

## Rules

- Never paste provider keys into issues, PRs, reports, or final answers.
- Use Browser E2E Phase C2 for model dropdown, image button gating, editor, and
  visible tool-card behavior.
- Use `QA_AI_DISABLE_REASONING=1` when reproducing shortcut/quick-action
  behavior for reasoning-heavy providers. Normal chat/tool behavior should be
  tested without that flag unless the task explicitly concerns shortcuts.
- Treat provider outages, quota, or account-balance failures as provider/infra
  first; rerun before changing product code.
- A successful provider smoke is not proof of full Humanly browser behavior.
- If `QA_AI_APP_REQUIRE_TOOL_CALL=0` is used, record missing tool traces as
  residual risk.

## What It Covers

- OpenAI-compatible text completion.
- Tool-call schema acceptance.
- Pseudo-tool/DSML/XML/JSON visible markup leak detection.
- Manifest expansion across models, document classes, and query types.
- Optional image input.
- Optional Humanly register/settings/document/upload/shortcut/chat path.

## References

- Modular QA map: `docs/testing/README.md`
- Manifest: `fixtures/qa/ai-usage/manifest.json`
- Harness source: `scripts/qa/ai-usage.mjs`
- Browser model matrix: `.agents/skills/humanly-browser-e2e/references/ai-model-matrix.md`
