# Agent Progress Tracker

Last updated: 2026-05-13 (post issue-restructure)

This document is the shared handoff surface for agents working on `humanly-code`.
GitHub issues and pull requests remain the source of truth for canonical history;
this file is the fast-read summary of what to do next and what not to forget.

## Workflow Contract

Feature and bug-fix work should follow this loop:

1. Create or pick a GitHub issue. **One feature = one issue**, even if it has multiple sub-tasks. Tightly-coupled work that touches the same files / domain ships as ONE consolidated issue with internal Task sections, not as 4 separate top-level issues. Reserve separate issues for genuinely independent slices or distinct bugs.
2. Branch from the target integration branch.
3. Code the smallest coherent slice.
4. Commit with the issue number in the message.
5. Push and open a PR against the integration branch.
6. Run local verification where practical and watch GitHub checks.
7. **The user manually merges PRs.** Agents never merge to integration locally / via gh.
8. After merge, the agent closes the issue, updates this tracker and the epic checklist, then deletes the merged feature branch.

Lightweight coordination docs, handoff notes, and tracker updates can skip issue creation when the user asks for quick shared context. Do not physically delete issues. Close completed issues with a comment that names the merged PR. When an issue is folded into another or superseded, close it with a comment pointing at the new tracker.

## Current Integration Branch

- Branch: `feat/agentic-chat`
- Epic: #4, "Epic: Agentic AI chat upgrade"
- Scope: read-only agentic AI chat, visible tool-call timeline, chat-to-editor handoff, and quick-action upgrades.
- Explicitly out of scope for this epic: autonomous AI editing of the document.

## Current State

| Issue | Work | PR | State |
| --- | --- | --- | --- |
| #5 | Shared agent event types | #1 | Merged & closed |
| #6 | AgentRunner with event sink | #2 | Merged & closed |
| #7 | Tool consolidation 8 → 4 | #3 | Merged & closed |
| #8 | `useAI` consumes agent events | #18 | Merged & closed |
| #9 | ToolCallCard + AI panel integration | #19 | Merged & closed |
| #10 | Insert assistant text at cursor | #20 | Merged & closed |
| #23 | Quick action UX overhaul (streaming + context + diff + shortcuts) | Not started | **Next** |

### Restructured / superseded

`#11`, `#12`, `#13`, `#14` closed and folded into the single consolidated issue #23 — Quick action UX overhaul. Rationale: they all touch `ai-selection-menu.tsx` and the silent-chat path; shipping them as one PR avoids four CI runs over a tightly-coupled slice.

`#15`, `#16`, `#17` (backlog: formatting tools / abort handling / provenance log) closed and folded into Epic #4 deferred backlog. Reopen as standalone issues when work is actually ready to start.

## Open PRs

None.

## Verification Notes

Recent local checks for #10 (still relevant context after merge):

- `pnpm build:shared` passed.
- `pnpm build:editor` passed.
- `pnpm --filter @humanly/frontend-user test -- AIAssistantPanelInsert.test.tsx --runInBand` passed.
- `pnpm --filter @humanly/frontend-user test -- ToolCallCard.test.tsx --runInBand` passed.
- `pnpm --filter @humanly/backend test -- ai.service.test.ts --runInBand` passed.
- Browser smoke test with a mock backend passed: assistant response inserted into the editor, and `POST /documents/dev-doc/events` included `eventType: ai_insert_from_chat`, `messageId`, `logId`, and updated `editorStateAfter`.

Known pre-existing local blockers:

- `frontend-user` full typecheck still reports unrelated review/PDF/radio-group/ResizablePanelGroup errors.
- backend full build still reports unrelated repo-wide TypeScript errors.
- On this macOS machine, local Jest can be blocked by a broken optional `canvas` native binding. CI is authoritative; locally, removing the broken optional canvas package lets jsdom fall back to no-canvas mode.

## Maintenance Rules

Update this file when:

- A PR is opened, merged, or abandoned.
- An issue is closed, opened, restructured (split/combined/superseded).
- The next recommended issue changes.
- A new local or CI blocker appears.
- A manual browser smoke test reveals behavior that is not obvious from code.

Keep entries brief. Link to GitHub by issue/PR number instead of duplicating full PR descriptions.
