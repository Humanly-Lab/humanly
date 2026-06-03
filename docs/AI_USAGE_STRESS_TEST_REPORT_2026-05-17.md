# AI Usage Stress Test Report — 2026-05-17

Control issue: [#169](https://github.com/ShenzheZhu/humanly/issues/169)
Bug fixed during pass: [#170](https://github.com/ShenzheZhu/humanly/issues/170) / [PR #171](https://github.com/ShenzheZhu/humanly/pull/171)

## Executive Summary

This pass was a stricter production AI usage regression run focused on one
question: can Humanly's AI assistant reliably use tools, answer from PDFs, avoid
dirty tool-call leakage, and keep quick actions clean across stable providers?

Final status after [PR #171](https://github.com/ShenzheZhu/humanly/pull/171):

- Backend agentic PDF QA: healthy.
- Production AI chat UI: healthy.
- Production quick actions: healthy after #170 fix and deploy.
- Production Kimi image input canary: healthy after follow-up pass.
- DeepSeek DSML / pseudo tool-call leakage: not reproduced.
- `I could not produce a final answer...` fallback leakage: not reproduced.
- Together Qwen remains excluded from the Together stable user-facing list.
- OpenRouter Qwen passed the compatibility matrix, but OpenRouter availability is
  account-balance dependent. Do not treat it as currently usable unless the
  configured OpenRouter key has credits.

## What Was New Compared With Earlier AI QA

Earlier AI usage passes were useful but narrower. The immediately preceding
stress pass covered:

- Together non-Qwen positive matrix: 35 pass, 1 manual quality-suspect.
- Together non-Qwen negative matrix: 3 pass.
- OpenRouter spot matrix: 16 pass.
- UI Kimi canary on one syllabus document.
- Quick-action backend path spot checks.
- Together Qwen provider instability diagnosis.

This pass expanded coverage in four ways:

1. Full stable model matrix instead of spot checks.
2. More PDF classes and sizes, including a 318-page local PDF and a 26 MB report.
3. More question types per document, including negative/not-found and exact marker lookup.
4. Production UI canaries for model picker, reasoning/tool cards, final answer rendering, and four quick-action silent rewrites.

## Stable Model Matrix

| Provider | Models Tested | Result |
| --- | --- | --- |
| Together | `moonshotai/Kimi-K2.6`, `deepseek-ai/DeepSeek-V4-Pro`, `zai-org/GLM-5` | Healthy after #170 quick-action fix |
| OpenRouter | `qwen/qwen3.5-397b-a17b`, `moonshotai/kimi-k2.6`, `deepseek/deepseek-v4-pro`, `z-ai/glm-5` | Compatibility healthy when the account has credits |
| Together excluded | `Qwen/Qwen3.5-397B-A17B` | Still excluded because Together structured tool calls can hang while plain text works |

## PDF Fixture Matrix

| Fixture | Class | Size / Pages | Why It Matters |
| --- | --- | --- | --- |
| ENV100 syllabus | short structured syllabus | 13 pages | Common student/instructor task format |
| Suzuki soil reading | article/chapter | 28 pages | Narrative reading with semantic questions |
| arXiv 2405.03524v5 | preprint | 23 pages | Technical academic PDF |
| Stanford AI slides | PPT-export/slides | 42 pages | Slide extraction and layout-like text |
| NASA climate strategy | large report | 26 MB | Heavy PDF upload and retrieval surface |
| synthetic long book | long known-marker book | 128 pages | Exact marker lookup with known answers |
| On the Brink of Paradox | long local book | 318 pages | Very long PDF navigation |
| Project Gutenberg history | lightweight public-domain report | 19 pages | Public-domain prose/report style |

Question coverage included direct fact lookup, summary, comparison, slide/list
extraction, exact marker lookup, long-document targeted lookup, and negative
"not present" queries.

## Backend Harness Results

Artifacts:

- `tmp/ai-usage-stress-results/ai-usage-full-together-stable-20260517T163313.json`
- `tmp/ai-usage-stress-results/ai-usage-full-together-stable-20260517T163313.md`
- `tmp/ai-usage-stress-results/ai-usage-full-openrouter-stable-20260517T165029.json`
- `tmp/ai-usage-stress-results/ai-usage-full-openrouter-stable-20260517T165029.md`

| Provider Group | Rows | Pass | Quality Suspect | Product Error | Provider Error | Max Latency | Avg Tool Calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Together stable | 60 | 59 | 1 | 0 | 0 | 80s | 3.3 |
| OpenRouter stable | 80 | 75 | 5 | 0 | 0 | 93s | 2.9 |
| Total | 140 | 134 | 6 | 0 | 0 | 93s | 3.1 |

All six quality-suspect rows were manually reviewed and classified as judge-string
artifacts, not product bugs. Examples:

- Qwen answered `July 4, 1971`; the exact string checker expected contiguous
  `july 1971`.
- GLM correctly wrote that `ZEBRA-QUARTZ-999` "does not appear"; the negative
  regex did not include that exact phrase.
- Several Suzuki summary answers were correct but did not contain the exact
  expected `adam/adama` terms.

Dirty output checks across the full matrix:

- DSML / pseudo tool-call leakage: 0.
- Bare JSON tool-call prose leakage: 0.
- `I could not produce a final answer...` leakage: 0.
- Missing tool calls with `QA_REQUIRE_TOOL_CALLS=1`: 0.

## Production UI Results

AI Assistant chat canary:

- Opened a production PDF-backed user document.
- Confirmed model picker showed the Together stable list:
  `moonshotai/Kimi-K2.6`, `deepseek-ai/DeepSeek-V4-Pro`, `zai-org/GLM-5`.
- Confirmed Together Qwen was not present.
- Asked: `who is the instructor and when are office hours?`
- UI showed a real-time Reasoning panel and tool cards:
  `ls`, `grep`, `grep`, `grep`.
- Final answer correctly returned Dr. Mark Hathaway and Mondays 2-3 PM via Zoom.
- No dirty tool markup or fallback text appeared in the UI.

Image-input canary:

- The original PDF stress matrix did not include multimodal turns. A follow-up
  production API canary was added immediately after that gap was identified.
- Artifact:
  `tmp/kimi-image-canary-20260517T221134.json`
- Provider/model:
  Together `moonshotai/Kimi-K2.6`
- Image:
  `tomato_egg_flavour_wheel.png`
- Result:
  5/5 passed.
- Kimi answered a vision question and identified the central title,
  `Tomato and Egg Stir-Fry Flavour Wheel`, plus readable labels such as
  `ketchup sweetness`, `dark soy sauce`, `tomato acidity`, and `egg richness`.
- The response was non-empty and had no fallback/tool-call leakage.
- Text-only Together DeepSeek rejected the same image with a stable
  `does not accept image input` capability error.

Quick-action canary:

- Tested the silent quick-action path used by grammar, improve, simplify, and formal.
- Initial pass found #170.
- After PR #171 deploy, all four passed:

| Action | Result | Latency | Output Health |
| --- | --- | ---: | --- |
| grammar | pass | 1051ms | non-empty, clean |
| improve | pass | 668ms | non-empty, clean |
| simplify | pass | 816ms | non-empty, clean |
| formal | pass | 714ms | non-empty, clean |

## Bug Found And Fixed

### #170 — Together Kimi quick actions can return empty rewrites unless thinking is disabled

Classification: `type:provider`.

Symptom:

- Selection quick actions using Together `moonshotai/Kimi-K2.6` could return
  `AI did not return a usable rewrite for the selected text. Please try again.`
- Direct provider probes showed `message.content=""` while the response budget
  was spent in `message.reasoning`.

Root cause:

- The backend only sent `chat_template_kwargs.enable_thinking=false` to Together
  Qwen.
- Together Kimi also accepts and needs that flag for short direct rewrite calls
  to produce visible content consistently.

Fix:

- PR #171 broadened the Together thinking-disable gate to the stable Together
  model list: Qwen, Kimi, DeepSeek V4 Pro, and GLM-5.
- Added regression coverage that:
  - Together Kimi silent quick actions send `enable_thinking=false`.
  - OpenRouter Kimi does not receive the Together-only kwarg.

Verification:

- `pnpm --filter @humanly/backend test -- src/__tests__/services/ai.service.test.ts --runInBand`
- `pnpm --filter @humanly/backend build`
- GitHub CI green on PR #171.
- Production deployed commit `c70d49f413f184c8c72827c6005c97d9bba4fc0a`.
- Fresh post-deploy quick-action canary passed all four actions.

## Robustness Improvements From This Pass

This pass improved robustness in three layers.

Product behavior:

- Quick actions no longer depend on Together Kimi's default reasoning behavior.
- Provider reasoning is explicitly disabled for stable Together direct rewrite calls.
- Existing fallback/dirty-output guards still reject unsafe output before it can
  be inserted into the editor.

Regression locks:

- Added backend unit coverage for Together Kimi quick-action thinking control.
- Added backend unit coverage that OpenRouter Kimi is not given Together-only
  request parameters.
- Added #170 to the regression ledger.
- Updated the post-deploy canary wording so future runs use a stable model,
  not Together Qwen.

QA process:

- The full AI usage matrix now has a concrete baseline: 140 backend rows,
  8 PDF classes, 20 prompts, 7 stable model/provider combinations.
- Future QA findings must be compared against the regression ledger before
  filing a "new" bug.
- Quality-suspect rows require manual review before being promoted to product bugs.

## Old-Bug Regression Checks Covered

This pass explicitly rechecked prior high-risk AI bugs:

| Prior Risk | Rechecked By | Result |
| --- | --- | --- |
| #104 quick actions splice fallback text into selected text | four quick-action silent rewrites | not reproduced after #171 |
| #107 Together Qwen provider instability | Together Qwen excluded; OpenRouter Qwen tested | stable policy confirmed |
| #126 empty provider stream on quick action | quick-action non-empty output checks | protected by retry and #170 fix |
| #133 retrieval-heavy chat hangs indefinitely | 140-row matrix with 80s/93s max observed latencies | no product hang |
| #136 over-reliance on slow tool loops | short syllabus and small report questions | tool usage bounded |
| DeepSeek DSML visible tool-call leakage | DeepSeek on Together and OpenRouter across PDF matrix | not reproduced |
| Final-answer fallback leakage | dirty/fallback regex scan on all rows + UI canary | not reproduced |

Follow-up image coverage:

- Multimodal image-input turns were not part of the original PDF-centric matrix.
  They were covered by the follow-up Kimi image canary described above.
- #110 and #115 remain in the regression ledger because future image regressions
  can still happen through storage, ownership, capability gating, or provider
  vision behavior.

## Residual Risks

These are not current product bugs, but they remain live areas to keep testing:

- Provider availability can still fluctuate; 429/503/service unavailable should
  be classified as provider behavior if Humanly surfaces a bounded error.
- OpenRouter compatibility results do not imply the current OpenRouter account
  has credits. Check credits before exposing OpenRouter models as active options.
- Image-input behavior depends on model capability flags, attachment storage,
  and provider vision support. Re-test it separately from PDF retrieval because
  passing agentic PDF QA does not prove multimodal chat is healthy.
- Full editor-selection UI automation is still browser-agent-assisted rather
  than a stable CI harness. Keep lower-level quick-action tests strong.
- Model lists should stay small and QA-backed. Do not add a model to the user
  list just because the provider catalog exposes it.
- Very long PDFs should remain in the regular stress matrix because latency and
  tool-loop behavior are where provider regressions tend to surface.

## Next-Time Checklist

Before calling a future AI usage release healthy:

1. Run the stable provider/model matrix or a documented subset.
2. Include at least one short syllabus, one article/chapter, one preprint, one
   slide/PPT-export, one large report, and one long book-style PDF.
3. Require real tool calls for agent chat rows.
4. Scan every answer for DSML, pseudo tool calls, JSON tool-call prose, and
   final-answer fallback text.
5. Run one image attachment turn with a funded vision-capable model and one
   non-vision model gating check.
6. Manually review quality-suspect rows before filing bugs.
7. Run production UI canaries for model picker, reasoning/tool cards, final
   answer rendering, and the four quick actions.
8. If a bug is found, add or update a regression ledger row and retest
   production after deploy.
