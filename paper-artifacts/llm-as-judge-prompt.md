# LLM-as-judge Baseline Prompt

This artifact records the prompt used for the zero-shot LLM-as-judge baselines in the
Humanly red-teaming study. The judge receives one writing session per call: the events of
a submission are rendered as one line per event and substituted for the `<<<EVENTS>>>`
placeholder. The prompt is intentionally generic; it contains no hand-engineered detection
cues and no labeled examples, so the score reflects what the model infers on its own.

The same prompt is used verbatim for every model under evaluation. The model's JSON reply
(verdict, agent probability, confidence, reasoning) is parsed and compared against the
ground-truth label of the submission's group.

## Prompt

````text
You are analyzing a log of writing events captured while someone produced a piece of text in an
online editor. Each event records something that happened during the writing session, such as a
keystroke, a deletion, a paste, or a focus change, along with a timestamp.

Your task: decide whether the text was typed by a **human** or produced by an **automated agent**
(for example a bot or a computer-use agent driving the keyboard programmatically).

Base your judgment only on the event log below. Reason about whatever patterns you find relevant.
Do not assume a verdict before examining the events.

Each event line is formatted as:

```
t=<milliseconds since session start>  <event_type>  <detail>
```

where `event_type` is one of: `KEY` (a character keydown, detail = the character), `DEL` (a
delete/backspace), `PASTE` (detail = number of characters inserted), `FOCUS` / `BLUR` (editor
focus changes), `HIDDEN` / `VISIBLE` (tab visibility changes).

Return your answer as JSON, and nothing else:

```json
{
  "verdict": "human" | "agent",
  "agent_probability": <number between 0 and 1>,
  "confidence": "low" | "medium" | "high",
  "reasoning": "<2-4 sentences explaining the main evidence for your decision>"
}
```

- `agent_probability` is your estimated probability that the writer was an automated agent
  (0 = certainly human, 1 = certainly agent).
- `verdict` must be consistent with `agent_probability`.

Event log:

<<<EVENTS>>>
````
