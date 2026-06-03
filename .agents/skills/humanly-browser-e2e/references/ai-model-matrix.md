# Focused AI Model Matrix

Run this module as Browser E2E Phase C2 when model/provider UI behavior changes
or when validating a production model list.

## Curated OpenRouter Matrix

| Model | Expected label | Image input |
| --- | --- | --- |
| `qwen/qwen3.5-397b-a17b` | `qwen/qwen3.5-397b-a17b (image+text)` | enabled |
| `qwen/qwen3.5-9b` | `qwen/qwen3.5-9b (image+text)` | enabled |
| `moonshotai/kimi-k2.6` | `moonshotai/kimi-k2.6 (image+text)` | enabled |
| `deepseek/deepseek-v4-pro` | `deepseek/deepseek-v4-pro (text only)` | disabled |
| `z-ai/glm-5.1` | `z-ai/glm-5.1 (text only)` | disabled |
| `anthropic/claude-sonnet-4.6` | `anthropic/claude-sonnet-4.6 (image+text)` | enabled |
| `openai/gpt-5.4-mini` | `openai/gpt-5.4-mini (image+text)` | enabled |
| `google/gemini-3.1-flash-lite` | `google/gemini-3.1-flash-lite (image+text)` | enabled |

## Fixture

Use a small uploaded syllabus-style PDF with a known answer. The current
production smoke fixture asks:

```text
What percentage is the final exam worth? Answer briefly and mention the page.
```

Expected answer: final exam is worth 34%, page 6 or equivalent page reference.

If the fixture changes, record the file name, document id, exact question, and
expected answer in the QA issue before running the matrix.

## Per-Model Steps

1. Open the same document for every model.
2. Select the provider and model.
3. Confirm the dropdown label says `(image+text)` or `(text only)`.
4. Confirm the image attach control is enabled only for image+text models.
5. Start a fresh chat when switching model families unless the check is
   explicitly about existing-history switching.
6. Ask the grounded PDF fixture question.
7. Confirm visible reasoning/status, tool-call cards, and final answer are
   separated.
8. Confirm no raw DSML/XML/JSON pseudo tool markup leaks into the final message.
9. Confirm the final answer matches the fixture.

## Edge Checks

Run these at least once per focused matrix, and repeat on any model family that
showed unusual behavior:

- Negative lookup: ask for a fact absent from the PDF. Expected result is an
  honest "not found in the document" style answer, not hallucination.
- Quick action after model switch: select a short editor sentence, run a quick
  action, apply it, and confirm only the selection changes.
- Image-capable model: attach a simple image and text prompt if browser upload
  controls are available in the current environment.
- Text-only guard: confirm text-only models do not accept image input.
- Image-history switch guard: after a chat contains an image attachment, switch
  to a text-only model and confirm the product asks to start a new chat or
  otherwise prevents sending incompatible image history.

Browser automation may be unable to complete a local file chooser in some
contexts. If so, record the image-upload part as residual risk, but still verify
button gating and image-history switching.

## Pass Criteria

A model passes the browser matrix only when:

- the model is selectable;
- label and image control match expected capability;
- grounded PDF question returns the expected answer;
- at least one retrieval tool-call card is visible for the grounded question;
- final answer is distinct from reasoning/tool text;
- no raw tool markup leaks;
- the next turn still works after the model is selected.

## Result Table

```markdown
| Model | Label OK | Image gate OK | PDF QA | Tool UI | No raw markup | Follow-up | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `model/id` | pass/fail | pass/fail | pass/fail | pass/fail | pass/fail | pass/fail | ... |
```

Add bug links for any fail. If a provider outage blocks a model, classify it as
provider/infra first, then rerun later before changing product code.
