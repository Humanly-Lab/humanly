# Agent Progress Tracker

Last updated: 2026-05-14 (#43 Qwen3.5 smoke PR opened)

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
- Status: **all active sub-issues shipped**. Main integration is intentionally paused for now; PR #29 is left open as the eventual merge vehicle and its conflict with `main` is not a current blocker.

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

## Open follow-up issues

- **#42** Use Qwen3.5-397B for real agent smoke and fail on bad model outputs. PR #43 open.

## Open work outside Epic #4

- **#38** Admin Create Task form/environment layout alignment. This is separate from the agentic-chat branch and should branch from the relevant user/admin-port integration branch, not from `feat/agentic-chat`.

### Recently merged follow-ups

- **#30** Permanent real-LLM agentic integration test script merged into `feat/agentic-chat`.
- **#31 / #34** Reasoning content now flows as `AgentEvent.thinking-delta` and renders in a collapsed Reasoning block.
- **#33 / #35** Assistant Markdown now supports GitHub-flavored tables via `remark-gfm`, including a browser smoke against the local mock backend.
- **#40 / #41** Local mock certificate endpoints now cover list, generate, detail, and AI-stats smoke paths; full localhost smoke ran with zero new console errors.

### Recently merged outside Epic #4

- **#37 / #39** Frontend-user New Document environment form restructure merged into `feat/user-port`; issue closed and remote topic branch deleted.

## Verification Notes

### Real-LLM agent smoke (2026-05-14)

`scripts/agentic-integration-test.mjs` invoked the AgentRunner-equivalent loop against the real Together AI endpoint, with the user's ENV 100 syllabus PDF mounted as a linked paper. Models tested:

- `Qwen/Qwen3.5-397B-A17B` — **target model per user direction**. 9/9 edge prompts completed end-to-end; structured tool calls worked; grading table, learning outcomes, policy comparison, current-doc + linked-PDF routing, structured JSON output, AI-policy lookup, assignment due dates, and negative parking-permit answer all completed correctly. PR #43 updates the script default, product defaults, Together whitelist, and validation so empty finals / pseudo tool-call markup fail the smoke.
- Curated Together whitelist quick-smoke passed on lookup + missing-evidence prompts for `moonshotai/Kimi-K2.6`, `moonshotai/Kimi-K2.5`, `deepseek-ai/DeepSeek-V4-Pro`, `zai-org/GLM-5.1`, and `zai-org/GLM-5`.
- `Qwen/Qwen3.6-Plus` — rejected from the curated list for now: returned `finish_reason=tool_calls` with no streamed tool-call payload or final answer on the quick smoke.
- `meta-llama/Llama-3.3-70B-Instruct-Turbo` — kept out of the curated Together user list for now: it can complete the broader core run, but in the quick missing-evidence smoke it stopped after checking only the current document instead of continuing into the linked PDF.
- `Qwen/Qwen3.5-9B` — rejected as the default target for now: it emitted structured tools sometimes, but also produced empty final answers and pseudo tool-call XML in visible text.
- `deepseek-ai/DeepSeek-R1` — proves the parser handles inline reasoning. 1929 chars of reasoning captured per prompt (closes with `</think>` only; Together strips the opening tag). The model does not reliably emit structured `tool_calls` over Together's chat-completions API, which is a model limitation, not an AgentRunner bug. Tracked under follow-up #31 for first-class wiring.

Traces live under `tmp/agent-trace/run-*` (gitignored). The script + how-to is in PR #30.

### Visual smoke for #23 (Quick Action UX Overhaul) — 2026-05-13

Mock track confirmed:

- Streaming typewriter effect on quick-action review card.
- Voice preservation via `surroundingContext` carrying `documentTitle` + ±200 char windows (mock signal: `[voice-aware: title="..."]` suffix appended).
- Word-level inline diff renders `They are` as red strike-through + `It is` as green underlined when grammar mock rewrites trigger.
- Cancel/Discard button label switches on `isStreaming`; mid-stream Cancel emits `ai:cancel` with the `silent` sentinel.
- Chat regression: a `search for motivation` prompt still produces a `searchDocument` tool card (no leakage between silent and chat sessions).
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
