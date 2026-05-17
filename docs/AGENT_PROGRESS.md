# Agent Progress Tracker

Last updated: 2026-05-17 (#140/#141 backend build + export cleanup in progress)

This document is the shared handoff surface for agents working on `humanly-code`.
GitHub issues and pull requests remain the source of truth for canonical history;
this file is the fast-read summary of what to do next and what not to forget.

## Workflow Contract

Feature and bug-fix work should follow this loop:

1. Create or pick a GitHub issue. **One feature = one issue**, even if it has multiple sub-tasks. Tightly-coupled work that touches the same files / domain ships as ONE consolidated issue with internal Task sections, not as 4 separate top-level issues. Reserve separate issues for genuinely independent slices or distinct bugs.
2. Branch from the target integration branch.
3. Code the smallest coherent slice.
4. **勤 commit** — within a branch, split work into small logical commits, one per Task section / file group / orthogonal concern. Each commit message references the issue number.
5. Push and open a PR against the integration branch.
6. Run local verification where practical and watch GitHub checks.
7. For **any slice that ships a visible UX change**, the agent runs the mock-track local dev (`pnpm dev:mock` + `pnpm dev:frontend-user`) and opens `http://localhost:3002/dev-bypass-login.html` for the user, then posts step-by-step click instructions and **waits for the user's verdict** before declaring the slice done. See `docs/LOCAL_DEV.md` for the canonical procedure shared by Claude Code and Codex.
8. **The user manually merges PRs.** Agents never merge to integration locally / via gh.
9. After merge, the agent closes the issue, updates this tracker and the epic checklist, then deletes the merged feature branch.

Lightweight coordination docs, handoff notes, and tracker updates can skip issue creation when the user asks for quick shared context. Do not physically delete issues. Close completed issues with a comment that names the merged PR. When an issue is folded into another or superseded, close it with a comment pointing at the new tracker.

## Current Integration Branch

- Branch: `feat/agentic-chat`
- Epic: #4, "Epic: Agentic AI chat upgrade"
- Scope: read-only agentic AI chat, visible tool-call timeline, chat-to-editor handoff, and quick-action upgrades.
- Explicitly out of scope for this epic: autonomous AI editing of the document.
- Status: **all active sub-issues shipped for the current agentic-chat slice**. Main integration is intentionally paused for now; PR #29 is left open as the eventual merge vehicle and its conflict with `main` is not a current blocker.

## Current State

| Issue | Work | PR | State |
| --- | --- | --- | --- |
| #5 | Shared agent event types | #1 | Merged & closed |
| #6 | AgentRunner with event sink | #2 | Merged & closed |
| #7 | Tool consolidation 8 → 4 | #3 | Merged & closed |
| #8 | `useAI` consumes agent events | #18 | Merged & closed |
| #9 | ToolCallCard + AI panel integration | #19 | Merged & closed |
| #10 | Insert assistant text at cursor | #20 | Merged & closed |
| #23 | Quick action UX overhaul (streaming + context + diff + shortcuts) | #25 | Merged & closed |
| #59 | Configurable 20-tool budget + final-answer fallback | #61 | Merged & closed |
| #65 | Streaming/model-swap hardening + PDF search fixes | #66 | Merged & closed |
| #70 | Reference-only `ls` / `grep` / `read` tool redesign | #71 | Merged & closed |
| #73 | Two-PDF / four-model QA smoke + DeepSeek V4 Pro whitelist + 60 tool-call default | #74 | Merged & closed |
| #85 | DeepSeek DSML / JSON pseudo tool-call leakage | #86 | Merged & closed |
| #88 | Sync agent smoke pseudo-call checks with DeepSeek hardening | #89 | Open |
| — | LOCAL_DEV mock infra (`pnpm dev:mock`, bypass-login, docs) | #27 | Merged |

### Deferred backlog (Epic #4 checklist; reopen as standalone issues when ready)

- Formatting AI tools (bold / heading / list)
- Abort / cancel in-flight agent runs
- Persist tool calls to `document_events` for provenance trail

### Restructured / superseded (historical)

`#11`, `#12`, `#13`, `#14` were closed and folded into the single consolidated issue #23 — Quick action UX overhaul. They all touched `ai-selection-menu.tsx` and the silent-chat path; shipping them as one PR avoided four CI runs over a tightly-coupled slice.

`#15`, `#16`, `#17` (backlog: formatting tools / abort handling / provenance log) were closed and folded into the Epic #4 deferred backlog. Reopen as standalone issues when work is actually ready to start.

## Open PRs

- **#29** `feat/agentic-chat` → `main` — final integration merge for Epic #4. **Paused** because we are not merging to `main` yet; GitHub currently reports conflicts with `main`, which are expected to be handled only when main integration resumes.
- **#89** `fix/88-sync-agent-smoke-pseudo-call-rules` → `main` — updates prompt wording and the real-LLM smoke validator so DSML / JSON pseudo tool-call leaks are caught by the harness too. CI is green.

## Open follow-up issues

- **#63** Hide raw model reasoning and show realtime AI activity. Raw provider reasoning should not render as user-visible chain-of-thought; the UI should show status/activity like reading files, searching, and composing.
- **#72** Store uploaded PDFs in Google Cloud Storage. Local Docker currently mounts `packages/backend/storage` into the backend container; production-grade storage still needs GCS.
- **#105** Direct `api.writehumanly.net` TLS certificate hostname mismatch. The production app/admin proxied API paths work and are the current QA path.

## Open work outside Epic #4

- **#38** Admin Create Task form/environment layout alignment. This is separate from the agentic-chat branch and should branch from the relevant user/admin-port integration branch, not from `feat/agentic-chat`.

### Recently merged follow-ups

- **#30** Permanent real-LLM agentic integration test script merged into `feat/agentic-chat`.
- **#31 / #34** Reasoning content now flows as `AgentEvent.thinking-delta` and renders in a collapsed Reasoning block.
- **#33 / #35** Assistant Markdown now supports GitHub-flavored tables via `remark-gfm`, including a browser smoke against the local mock backend.
- **#40 / #41** Local mock certificate endpoints now cover list, generate, detail, and AI-stats smoke paths; full localhost smoke ran with zero new console errors.
- **#59 / #61** Agent tool budget is configurable via `AI_AGENT_MAX_TOOL_CALLS` (default 20); budget exhaustion now synthesizes a final answer instead of returning an empty response.
- **#62 / #64 / #61** Quick-action silent streams are matched by `clientRequestId`; empty provider output now errors instead of inserting fallback text into the document.
- **#65 / #66** Model-switch quick-action fallback, PDF search stuck-on-first-pages behavior, and pseudo tool-call leakage were hardened.
- **#70 / #71** AI retrieval surface was redesigned from document/paper-specific tools to reference-only unix-style primitives: `ls`, `grep`, and `read`, with adaptive strategy hints and a fallback ladder.
- **#73 / #74** Two-PDF / four-model real-LLM manual QA smoke completed. Product change adds `deepseek-ai/DeepSeek-V4-Pro` to the curated Together list and raises the default `AI_AGENT_MAX_TOOL_CALLS` fallback from 20 to 60 while preserving env override support.
- **#85 / #86** DeepSeek V4 Pro DSML pseudo tool-call blocks like `<｜DSML｜tool_calls>...` and visible JSON pseudo calls like `{"function":"ls","arguments":{}}` are detected, withheld during streaming, and stripped from stored output; repair prompt now references `ls` / `grep` / `read`.
- **#88 / #89** Open PR: real-LLM smoke script now flags DSML and visible JSON pseudo-call leaks, matching the product hardening.

### Recently merged outside Epic #4

- **#37 / #39** Frontend-user New Document environment form restructure merged into `feat/user-port`; issue closed and remote topic branch deleted.
- **#130** Full production regression completed on 2026-05-17. Final report lives in issue #130. Fixed #131/#132, #133/#134/#135, #136/#137, and #138/#139; residual #105 remains.
- **#140 / #141** In progress: backend `tsc` build debt is fixed locally, and task export now mounts at `/api/v1/tasks/:taskId/export/*` while exporting both tracker `events` and user-portal `document_events`.
- **#142 / #143** Reusable production QA playbook, QA control issue initializer, architecture backlog, and analytics query indexes merged to `main`.

## Verification Notes

### Real-LLM agent smoke (2026-05-15)

`scripts/agentic-integration-test.mjs` invoked the AgentRunner-equivalent loop against the real Together AI endpoint, with the user's ENV 100 syllabus PDF mounted as a linked paper. Models tested:

- `Qwen/Qwen3.5-397B-A17B` — **target model per user direction**. 9/9 edge prompts completed end-to-end; structured tool calls worked; grading table, learning outcomes, policy comparison, current-doc + linked-PDF routing, structured JSON output, AI-policy lookup, assignment due dates, and negative parking-permit answer all completed correctly. PR #43 updates the script default, product defaults, Together whitelist, and validation so empty finals / pseudo tool-call markup fail the smoke.
- Curated Together whitelist quick-smoke passed on lookup + missing-evidence prompts for `moonshotai/Kimi-K2.6`, `moonshotai/Kimi-K2.5`, `deepseek-ai/DeepSeek-V4-Pro`, `zai-org/GLM-5.1`, and `zai-org/GLM-5`.
- `Qwen/Qwen3.6-Plus` — rejected from the curated list for now: returned `finish_reason=tool_calls` with no streamed tool-call payload or final answer on the quick smoke.
- #47 hardening now detects that empty-tool-call provider state, retries once with an internal structured-tool repair prompt, then fails explicitly if the provider still returns no usable tool-call payload. A post-hardening Qwen3.6-Plus quick smoke still failed, but now with a clear `finish_reason=tool_calls without a valid tool_calls payload after repair retry` error instead of a silent empty final.
- `meta-llama/Llama-3.3-70B-Instruct-Turbo` — kept out of the curated Together user list for now: it can complete the broader core run, but in the quick missing-evidence smoke it stopped after checking only the current document instead of continuing into the linked PDF.
- `Qwen/Qwen3.5-9B` — rejected as the default target for now: it emitted structured tools sometimes, but also produced empty final answers and pseudo tool-call XML in visible text.
- `deepseek-ai/DeepSeek-R1` — proves the parser handles inline reasoning. 1929 chars of reasoning captured per prompt (closes with `</think>` only; Together strips the opening tag). The model does not reliably emit structured `tool_calls` over Together's chat-completions API, which is a model limitation, not an AgentRunner bug. Tracked under follow-up #31 for first-class wiring.
- `moonshotai/Kimi-K2.6` — after #70's `ls` / `grep` / `read` redesign, 9/9 real-LLM prompts against the ENV 100 syllabus completed. The model naturally used `ls -> grep -> read`, refused editor-content requests with zero tool calls, and avoided pseudo tool-call leakage. One negative-case validation was a regex false alarm, not a model failure.

### Two-PDF / four-model manual QA smoke (2026-05-15)

Issue #73 / PR #74 used two local PDFs and manually judged 10 questions per file:

- `syllabus fsta02 2026.pdf`
- `Suzuki, D. T., McConnell, A., & Mason, A. (2007). Made from the soil.pdf`

Models tested through the Together-compatible tool-calling harness:

| Model | Runs | Manual judgment | Notes |
| --- | ---: | --- | --- |
| `Qwen/Qwen3.5-397B-A17B` | 20/20 | 19 pass / 1 partial | Fast and concise; one long-paper biodiversity answer missed the teaspoon-level counts. |
| `moonshotai/Kimi-K2.6` | 20/20 | 20 pass / 0 partial | Thorough and reliable, but generally more tool-heavy / slower. |
| `deepseek-ai/DeepSeek-V4-Pro` | 20/20 | 20 pass / 0 partial | Strong factual coverage; added to curated Together options in #74. |
| `zai-org/GLM-5` | 20/20 | 20 pass / 0 partial | Solid factual coverage; one or two runs were slower but completed cleanly. |

Sanity checks across all 80 runs: no empty final answers, no "could not produce final answer" fallback text, no pseudo tool-call markup in visible output, and all runs ended with provider `finish_reason=stop`. The maximum observed tool count was 13, but #74 raises the configurable default from 20 to 60 to leave more room for longer PDFs.

Traces live under `tmp/agent-trace/run-*` (gitignored). The script + how-to is in PR #30.

### Visual smoke for #23 (Quick Action UX Overhaul) — 2026-05-13

Mock track confirmed:

- Streaming typewriter effect on quick-action review card.
- Voice preservation via `surroundingContext` carrying `documentTitle` + ±200 char windows (mock signal: `[voice-aware: title="..."]` suffix appended).
- Word-level inline diff renders `They are` as red strike-through + `It is` as green underlined when grammar mock rewrites trigger.
- Cancel/Discard button label switches on `isStreaming`; mid-stream Cancel emits `ai:cancel` with the `silent` sentinel.
- Chat regression: with the #70 tool redesign, search-like prompts now produce `ls` / `grep` / `read` tool cards (no leakage between silent and chat sessions).
- Cmd+Shift+1..4 shortcuts shipped but skipped from explicit user smoke — kept in code per user direction.

Known pre-existing local blockers (unchanged):

- `frontend-user` full typecheck still reports unrelated review/PDF/radio-group/ResizablePanelGroup errors.
- backend full build still reports unrelated repo-wide TypeScript errors.
- On macOS, local Jest is blocked by a broken optional `canvas` native binding. CI is authoritative; locally, remove `node_modules/.pnpm/canvas@*` and `node_modules/canvas` so jsdom falls back to no-canvas mode.

## Maintenance Rules

Update this file when:

- A PR is opened, merged, or abandoned.
- An issue is closed, opened, restructured (split/combined/superseded).
- The next recommended issue changes.
- A new local or CI blocker appears.
- A manual browser smoke test reveals behavior that is not obvious from code.

Keep entries brief. Link to GitHub by issue/PR number instead of duplicating full PR descriptions.
