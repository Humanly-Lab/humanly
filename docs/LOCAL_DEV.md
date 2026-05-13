# Local Dev Quickstart

Canonical procedure for spinning up `humanly-code` on a developer / agent
machine for manual smoke tests and visible-feature verification. Claude
Code and Codex both follow this exact procedure so handoffs do not need
to re-explain how to run the platform.

## Two tracks

| Track | When to use | What you need |
| --- | --- | --- |
| **Mock track** (recommended for agent smoke) | Visual UX verification, no real LLM needed, no real auth needed | Just Node 20 + pnpm. No Docker. No DB. No `.env`. |
| **Real track** | End-to-end testing against real DB / real LLM | Docker Desktop + `.env` files + a Together AI or OpenAI key |

Most "manual test before merging this PR" handoffs are mock-track. The
real track is for full system tests against a near-prod environment.

## Mock track — recommended

```bash
# from humanly-code/  (Node 20.x active via nvm)
pnpm build:shared       # rebuild types if shared changed
pnpm build:editor       # rebuild editor if editor changed
pnpm dev:mock &         # mock backend on :3001
pnpm dev:frontend-user  # user portal on :3002
```

Then open the bypass-login page in a browser — it writes a mock token to
localStorage and jumps to the seeded document:

```
http://localhost:3002/dev-bypass-login.html
```

After redirect you land on `/documents/doc-1`, which the mock server has
pre-populated with a short multi-paragraph document including the word
"motivation" so retrieval / tool-call smoke tests work out of the box.
You can target a different mock doc id via `?doc=<id>` — but `doc-1` is
the only one the mock backend currently serves.

What the mock backend supports:

- **Auth**: `/auth/me`, `/auth/login`, `/auth/refresh`, `/auth/logout`. The bypass page writes the same mock token the mock server accepts.
- **Documents**: `GET /documents`, `GET/PUT /documents/:id`, `POST /documents/:id/events` (logs the inserted event types to stdout).
- **AI**: `GET /ai/settings` (returns `hasApiKey: true` so the selection menu activates), `GET /ai/sessions`, `POST /ai/chat`, `POST /ai/selection-action`, `GET /ai/logs`.
- **Socket.IO `ai:message`**:
  - Regular chat — emits a typed tool-call lifecycle (`ai:turn-start` / `ai:tool-call` / `ai:tool-result` / `ai:turn-end`) when the user message looks search-like (mentions search/find/where/motivation/grammar/paper), then streams a text reply.
  - Silent mode (`data.silent === true`) — streams a quick-action rewrite over `sessionId: 'silent'`. The rewrite intent is sniffed from the prompt prefix (grammar / improve / simplify / formal). The voice-aware suffix `[voice-aware: title="..."]` is appended when `surroundingContext` is supplied, so #23-style surrounding-context wiring is visually verifiable.
- **Cancel**: `ai:cancel` halts whichever in-flight emit loop matches the supplied `sessionId`.

Anything not listed returns `404 {"success": false, "error": "Not found in mock"}`. Add to `scripts/dev-mock-server.mjs` if a new flow needs mocking.

## Real track

Use this when you need true persistence (Postgres / TimescaleDB), Redis
session caching, or to exercise a real LLM provider.

```bash
# one-time
bash scripts/setup-env.sh    # copies .env.example → .env in each package
# fill in AI_API_KEY, AI_BASE_URL, AI_MODEL, etc. in packages/backend/.env

# each session
pnpm docker:up               # postgres + redis
pnpm build:shared
pnpm build:editor
pnpm dev:backend             # :3001  (real backend)
pnpm dev:frontend-user       # :3002
```

Then log in through the regular `/login` route at `http://localhost:3002/login`.

## Agent handoff protocol for manual tests

When an agent (Claude Code or Codex) finishes a slice that needs a visible browser smoke test:

1. **Run the mock track** in two background processes (`pnpm dev:mock`, `pnpm dev:frontend-user`).
2. **Open the user portal** at `http://localhost:3002/dev-bypass-login.html` for the human.
3. **Post step-by-step click instructions** referencing the exact buttons and the exact expected outcomes (e.g. "select the line containing `they are bad grammar`, press `Cmd+Shift+1`, expect typewriter streaming + a red/green diff in the review card").
4. **Wait** for the human's verdict before invoking commit / push / PR or before declaring the slice done.

The mock backend is the contract Claude and Codex both target. If a new
PR adds a flow the mock does not yet support, the same PR (or a sibling
PR opened first) should extend `scripts/dev-mock-server.mjs` and this
file, so the next agent does not start cold.

## Stopping everything

```bash
# foreground processes: Ctrl+C
# background pnpm dev:mock & pnpm dev:frontend-user &: kill those jobs
kill %1 %2 2>/dev/null || true

# real track only
pnpm docker:down
```

## Known local issues

- **Canvas native binding breaks Jest on macOS.** Remove `node_modules/.pnpm/canvas@2.11.2` and `node_modules/canvas` before running Jest; jsdom falls back to no-canvas mode. CI is authoritative.
- **Pre-existing repo-wide TypeScript errors** in review/PDF/radio-group/ResizablePanelGroup land before this Epic and surface under `pnpm --filter @humanly/frontend-user type-check`. Filter your own diff with `grep -v` against those paths.
- **Port collisions** with Codex Desktop or other Electron apps: `lsof -ti:3001,3002 | xargs ps -p` to confirm; kill stale `next-server` processes if your dev server fails to bind.
