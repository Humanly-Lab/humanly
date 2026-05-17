# Model Whitelist QA - 2026-05-17

Control issue: [#172](https://github.com/ShenzheZhu/humanly/issues/172)

## Decision

Ship these model-list changes:

- Together:
  - Keep `moonshotai/Kimi-K2.6`.
  - Keep `deepseek-ai/DeepSeek-V4-Pro`.
  - Replace `zai-org/GLM-5` with `zai-org/GLM-5.1`.
- OpenRouter:
  - Keep `qwen/qwen3.5-397b-a17b`.
  - Add `qwen/qwen3.5-9b`.
  - Keep `moonshotai/kimi-k2.6`.
  - Keep `deepseek/deepseek-v4-pro`.
  - Replace `z-ai/glm-5` with `z-ai/glm-5.1`.
  - Add `anthropic/claude-sonnet-4.6`.
  - Add `openai/gpt-5.4-mini`.
  - Add `google/gemini-3.1-flash-lite`.

Do not ship Together `Qwen/Qwen3.5-9B` yet. It exists in the provider catalog
and passed a direct provider tool-call smoke, but failed Humanly production
agentic PDF QA with repeated fallback final answers.

## Catalog Verification

Canonical ids verified from provider `/models` catalogs:

- Together:
  - `zai-org/GLM-5.1`
  - `Qwen/Qwen3.5-9B`
- OpenRouter:
  - `qwen/qwen3.5-9b`
  - `z-ai/glm-5.1`
  - `anthropic/claude-sonnet-4.6`
  - `openai/gpt-5.4-mini`
  - `google/gemini-3.1-flash-lite`

## Provider Smoke

Artifact:

- `tmp/model-whitelist-smoke/model-whitelist-smoke-retoken-20260517T222345.json`

Scope:

- Plain chat.
- Two-turn OpenAI-compatible tool calling.
- Reasoning capture check where the provider returned reasoning.
- Image input for models marked vision-capable.

Result:

- 9/9 direct provider smoke rows passed after using a realistic token budget.
- Reasoning-heavy models such as Qwen and GLM can return reasoning-only output
  when `max_tokens` is too small. The passing run used a larger budget closer
  to Humanly's production chat budget.

## Humanly Production AI Usage Matrix

Artifact:

- `tmp/ai-usage-stress-results/model-whitelist-aiusage-20260517T2230.json`

Scope:

- Real production app API and websocket.
- User AI settings saved with each candidate model.
- Agentic PDF reference retrieval with real `ls` / `grep` / `read` tool calls.
- Three fixture classes:
  - short structured syllabus;
  - PPT-export slides;
  - synthetic long book-style PDF.
- `QA_REQUIRE_TOOL_CALLS=1`.

Result:

- Total rows: 56.
- Pass: 50.
- Product-suspect: 4.
- Quality-suspect: 2.

Accepted model rows:

- Together `zai-org/GLM-5.1`: 8/8 pass.
- OpenRouter `qwen/qwen3.5-9b`: 8/8 pass, slower than the other new models.
- OpenRouter `z-ai/glm-5.1`: 8/8 pass.
- OpenRouter `anthropic/claude-sonnet-4.6`: 8/8 pass.
- OpenRouter `google/gemini-3.1-flash-lite`: 8/8 pass.
- OpenRouter `openai/gpt-5.4-mini`: 7/8 automatic pass plus one manually
  reviewed quality-suspect false positive. The answer correctly named
  Benedict Anderson and explained the quote, but did not repeat the exact
  phrase `Imagined Communities`.

Rejected / hold model rows:

- Together `Qwen/Qwen3.5-9B`: 4 product-suspect rows with
  `I could not produce a final answer from the available context.`
- It did call tools, but the Humanly agentic path did not reliably synthesize
  final answers, so it should not be exposed as a default stable option.

## Image Coverage

Direct provider image smoke passed for:

- Together `Qwen/Qwen3.5-9B` (not shipped because agentic PDF QA failed).
- OpenRouter `qwen/qwen3.5-397b-a17b`.
- OpenRouter `qwen/qwen3.5-9b`.
- OpenRouter `moonshotai/kimi-k2.6`.
- OpenRouter `anthropic/claude-sonnet-4.6`.
- OpenRouter `openai/gpt-5.4-mini`.
- OpenRouter `google/gemini-3.1-flash-lite`.

Production Humanly image-input testing for the newly added OpenRouter vision
models must be rerun after this whitelist change is deployed. Before deploy,
the production backend still treats those ids as unknown and therefore
text-only.

## Regression Notes

- Keep frontend-user, admin frontend, and backend capability matrices in
  lockstep.
- Do not add Together `Qwen/Qwen3.5-9B` without a fresh Humanly production
  agentic QA pass.
- OpenRouter compatibility is still account-balance dependent.
- Image flags are provider/model specific. Passing text/tool QA does not prove
  image input works through the deployed Humanly backend.
