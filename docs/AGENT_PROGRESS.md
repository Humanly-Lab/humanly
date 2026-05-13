# Agent Progress Tracker

Last updated: 2026-05-13

This document is the shared handoff surface for agents working on `humanly-code`.
GitHub issues and pull requests remain the source of truth for canonical history;
this file is the fast-read summary of what to do next and what not to forget.

## Workflow Contract

Feature and bug-fix work should follow this loop:

1. Create or pick a GitHub issue.
2. Branch from the target integration branch.
3. Code the smallest coherent slice.
4. Commit with the issue number in the message.
5. Push and open a PR against the integration branch.
6. Run local verification where practical and watch GitHub checks.
7. The user manually merges PRs.
8. After merge, the agent closes the issue, updates this tracker and the epic checklist, then deletes the merged feature branch.

Lightweight coordination docs, handoff notes, and tracker updates can skip issue creation when the user asks for quick shared context. Do not physically delete issues. Close completed issues with a comment that names the merged PR.

## Current Integration Branch

- Branch: `feat/agentic-chat`
- Epic: #4, "Epic: Agentic AI chat upgrade"
- Scope: read-only agentic AI chat, visible tool-call timeline, chat-to-editor handoff, and quick-action upgrades.
- Explicitly out of scope for this epic: autonomous AI editing of the document.

## Current State

| Issue | Work | PR | State | Notes |
| --- | --- | --- | --- | --- |
| #5 | Shared agent event types | #1 | Merged | Closed |
| #6 | AgentRunner with event sink | #2 | Merged | Closed |
| #7 | Tool consolidation 8 -> 4 | #3 | Merged | Closed |
| #8 | `useAI` consumes agent events | #18 | Merged | Closed |
| #9 | ToolCallCard + AI panel integration | #19 | Merged | Closed |
| #10 | Insert assistant response at editor cursor | #20 | Open, CI green | Waiting for user manual merge |
| #11 | Streaming quick actions | Not started | Open | Start after #10 is merged unless user redirects |
| #12 | Quick action prompts include context window | Not started | Open | Candidate to combine with #11 if implementation is tightly coupled |
| #13 | Inline diff visualization in review card | Not started | Open | Larger visible UX slice |
| #14 | Cmd+1/2/3/4 shortcuts | Not started | Open | Optional, can be deferred |
| #15 | Formatting tools | Backlog | Open | Backlog |
| #16 | Abort/cancel in-flight agent runs | Backlog | Open | Backlog |
| #17 | Persist tool calls to provenance trail | Backlog | Open | Backlog |

## Open PRs

### #20: Insert Assistant Text At Cursor

- Branch: `feat/agentic-chat-10-insert-at-cursor`
- Base: `feat/agentic-chat`
- Status: open, mergeable, all GitHub checks green as of 2026-05-13.
- User action needed: manually merge PR #20.
- Agent cleanup after merge:
  - Close issue #10 with a comment naming PR #20.
  - Mark #10 checked in epic #4.
  - Delete local and remote branch `feat/agentic-chat-10-insert-at-cursor`.
  - Update this file.

## Verification Notes

Recent local checks for #10:

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
- An issue is closed or split/combined.
- The next recommended issue changes.
- A new local or CI blocker appears.
- A manual browser smoke test reveals behavior that is not obvious from code.

Keep entries brief. Link to GitHub by issue/PR number instead of duplicating full PR descriptions.
