# Epic #534 Execution Guide — Policy-Enforcement Layer

Last updated: 2026-06-12. Owner: paper/agent coordination. Executor: Codex.

This guide layers epic-specific context on top of the general rules. It does
not replace them: read `docs/CODEX_DEVELOPMENT_MANUAL.md` (workflow, release
trains, commits, PRs, verification) and `docs/ISSUE_AUTHORING_GUIDE.md` first.
The issue bodies on GitHub are the authoritative spec — each one carries a
`v2 refinements` section with security and edge-case requirements that are
part of the acceptance criteria, not optional notes.

## 1. Mission and Hard Deadline

Epic #534 ships the policy-enforcement layer needed by the peer-review
red-teaming study. Four of the five features are **claimed in the EMNLP 2026
Demo paper (§5.1)**; the deployed build must match the paper wording when the
paper is submitted on **2026-07-04**. Treat that date as a release deadline
for #535–#538.

Design principle for every decision in this epic: **generalize, never
specialize**. There is no "peer review mode" anywhere in the code. Every
feature is a writing-environment configuration option; peer review is just
the configuration with every switch at maximum. If an implementation choice
forces a peer-review-specific code path, stop and rethink (or escalate).

## 2. Reading Order

1. Epic #534 (mapping table, implementation order, epic-level refinements)
2. The issue you are about to implement, including its `v2 refinements`
3. This guide's cross-cutting rules (§4) and the issue's gotcha card (§5)

## 3. Branch Plan and Order

Per the manual's release-train policy (§4 there): create one integration
branch for the epic, open feature PRs into it, and release to `main` when a
coherent train is ready.

- Integration branch: `feat/epic-534-policy-enforcement` (from `main`)
- Feature branches: `feat/<slug>-<issue#>` off the integration branch
- One issue = one feature PR, body contains `Closes #<issue>`

Implementation order is by difficulty, easiest first (rationale in the epic):

| # | Issue | Size | Depends on | Notes |
|---|---|---|---|---|
| 1 | #540 screenshot deterrence | S | #538 (one subtask only) | Ship toggle/notice/shortcut-logging now; add the `focus_anomaly` rule after #538 lands |
| 2 | #537 view-only resources | M- | — | |
| 3 | #536 AI-reliance score | M | — | **Builds the trusted-provider infra** (§4.1) |
| 4 | #538 anomaly flags | M+ | — | Heavy on fixtures and edge cases |
| 5 | #535 AI policy + guard | L | #536 (trusted provider) | Start its prompt design + injection fixtures in parallel once #536 lands |

All P0 items (#535–#538) must be merged, released, and deployed before
2026-07-04. #540 is P2 and may slip.

## 4. Cross-Cutting Engineering Rules

### 4.1 Trusted AI provider (security boundary)

`OpenAIProvider.baseUrl` is user-influenceable through task/user provider
overrides (`packages/backend/src/services/ai.service.ts:719`). The guard
(#535) and the judge (#536) are trust-critical: an attacker who controls
their endpoint defeats the entire layer. Therefore:

- Add a separate server-side provider config via env vars
  (`TRUSTED_AI_PROVIDER`, `TRUSTED_AI_API_KEY`, `TRUSTED_AI_MODEL`; mock
  supported) in `packages/backend/src/config/env.ts`.
- Build it in #536, expose it as a small module (suggested:
  `services/trusted-ai-provider.ts`), reuse it unchanged in #535.
- Trust-critical calls must never read task/user provider settings, and must
  never bill the writer's key or token budget.

### 4.2 Config-driven and backward compatible

All new behavior hangs off `WritingEnvironmentConfig`
(`packages/shared/src/types/environment.types.ts:21-57`) with defaults that
leave every existing task, document, and share link behaving exactly as
before. A config-less environment must be byte-for-byte indistinguishable
from today.

### 4.3 Shared package discipline

New event types and config fields go into `@humanly/shared` first
(`packages/shared/src/types/event.types.ts`, `environment.types.ts`).
Rebuild order: `shared` → `editor` → frontends. CI runs `pnpm build:all`.

### 4.4 Migrations

`packages/backend/src/db/migrations/` is append-only and auto-runs at backend
startup. #536 and #538 add columns (`ALTER TABLE ... ADD COLUMN IF NOT
EXISTS`, matching existing style). Never edit an existing migration file.
Call out every migration in the PR description.

### 4.5 Certificate seal versioning (escalation point)

Sealed fields are hashed under `hly-seal-v1`
(`packages/backend/src/services/certificate-seal.service.ts`). #535 (policy
hash) and #536 (score) extend the sealed payload. Adding fields changes the
canonical record for NEW certificates only — never recompute or reseal
existing certificates (compute-once invariant). Whether this warrants a
`hly-seal-v2` version bump is a **human decision**: propose in the PR, do not
decide unilaterally.

### 4.6 Mock-first testing

Everything must work offline with `AI_PROVIDER=mock`, including the guard and
judge (deterministic mock verdicts/scores). No test may require a real API
key. Required fixtures named in the issues: prompt-injection attempts (#535),
IME/composition session (#538), uniform-cadence bot vs human-like session
(#538).

### 4.7 Paper-term constraints

The paper claims, verbatim concepts: "locked review configuration", policy
"enforced by a guard model", "0–100 cognitive-offloading score", "flags for
suspicious activity such as anomalous typing speed". Product naming is free
(product says "AI-reliance score"), but do not ship behavior that contradicts
these claims, and flag any externally visible deviation in the PR so the
paper side can react. The paper deliberately does NOT claim screenshot
detection — no code path or UI copy may use the word "detect" for #540.

## 5. Per-Issue Gotcha Cards

**#540 deterrence (S).** Copy says "recorded and flagged", never "detected".
Per-OS shortcut visibility differs (macOS Meta+Shift+3/4/5 visible;
Win+Shift+S usually not) — document a coverage table. `visibilitychange` and
`blur` are separate signals.

Coverage note for the shipped deterrence layer:

| Environment | Browser-visible signal | Product behavior |
|---|---|---|
| macOS screenshot shortcuts | `Meta+Shift+3/4/5` keydown is often visible | Best-effort shortcut event logging |
| Windows PrintScreen | `PrintScreen` keydown is often visible | Best-effort shortcut event logging |
| Windows snipping shortcut | `Win+Shift+S` is generally not visible to pages | No detection claim |
| OS-level or hardware capture | Not available to ordinary web pages | No detection claim |

When `captureDeterrence` is enabled, the workspace notice says screen captures
are not permitted and that focus changes / browser-visible screenshot shortcuts
are recorded and may be flagged. The `focus_anomaly` rule is gated by
`captureDeterrence=true` and `resourceAccess=view-only`.

**#537 view-only (M-).** Two file surfaces (document files + task instruction
files incl. the enrollment route, `files.routes.ts:31-36`). Token binding
must work for guest sessions (X-Session-Id), not just JWT. PDF.js issues
Range requests — support or force full fetch, decide and document. Disable
the PDF text layer in view-only or the paper text leaks via copy. `no-store`
headers. Server-side AI retrieval must keep working (regression test).

**#536 score (M).** Trusted provider only (§4.1). Compute once at issuance,
seal, never recompute. temperature=0; record judgeModel + promptVersion.
Zero AI events → score 0 without a judge call; AI-off environment → score
omitted with reason. Deterministic transcript truncation with a `truncated`
flag. Malformed judge output → omit the score, never fabricate.

**#538 flags (M+).** Client timestamps are attacker-controlled — cross-check
intra-batch client deltas vs server `createdAt`; inconsistency is itself
`clock_skew_anomaly`. The editor tracker has no composition handling — IME
input will false-positive "text without input" unless handled (add
composition tracking or IME-session suppression + fixture). Whitelist
undo/redo/autosave-restore signatures before enabling that rule. Run as
SQL/Timescale aggregation, not in-memory. Flags are advisory evidence; copy
must never present them as verdicts.

**#535 guard (L).** Trusted provider only (§4.1). Cover all five entry
points via `getExecutionSettingsForDocument` (`ai.service.ts:2092`): `chat`
(2727), `streamChat` (2991), `applySuggestion` (3247), `silentChat` (2197),
`silentStreamChat` (2252) — classify silent paths first (user-content vs
system utility). Fail closed in `guarded` mode with a distinct
`guard_unavailable` status, separate from a policy block. Wrap user content
as delimited data; strict JSON output schema; schema violation → fail closed.
Blocked requests consume no writer budget. Per-decision `policyHash` on
events (owners can edit policy mid-task). Latency target p50 < 1.5s with a
"checking policy" UI state.

## 6. Verification Matrix

Per the manual's verification ladder, plus epic-specific minimums:

| Issue | Automated | Manual handoff (visible feature) |
|---|---|---|
| #540 | toggle/notice unit tests | notice appears; rapid blur cycles flag (after #538) |
| #537 | token expiry, direct-URL rejection, Range behavior | view-only PDF renders; copied network URL dies after TTL; downloadable mode unchanged |
| #536 | mock determinism, malformed-output fallback, migration | AI-heavy draft scores high, hand-typed scores low; rationale references real transcript |
| #538 | bot vs human fixtures, IME fixture, clock-skew fixture | scripted typing produces flags in owner view; normal session clean |
| #535 | allow/block/injection/guard-down suites across all 5 entries | guarded "no evaluative claims" policy blocks judgment requests, allows grammar fixes; events visible to owner |

Commands: `pnpm build:all`, `npm run test:backend`,
`npm run test:frontend-user`, `npm run lint`. CI green before PR review.

## 7. Escalate to Human (do not decide alone)

1. Seal version bump (`hly-seal-v2`) — §4.5
2. Guard/judge model choice and its latency/cost envelope
3. Default anomaly thresholds before the compliant-group pilot
4. Any deviation from paper-claimed behavior (§4.7)
5. Stuck > 30 min on any blocker — report state in the issue +
   `docs/AGENT_PROGRESS.md`, then move to the next item in the order
