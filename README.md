# Humanly

Humanly is a traceable, AI-native writing platform. It records writing
provenance, supports configurable in-document AI assistance, and generates
verifiable certificates that show how a document was produced.

Production:

- User portal: https://app.writehumanly.net/
- Admin dashboard: https://admin.writehumanly.net/
- Direct API/tracker host: https://api.writehumanly.net/

## Monorepo Layout

```text
packages/
  backend/        Express API, Socket.IO, PostgreSQL/TimescaleDB, Redis
  frontend/       Next.js admin dashboard
  frontend-user/  Next.js user writing portal
  editor/         Lexical editor package with provenance capture
  tracker/        External-form tracking library
  shared/         Shared TypeScript types and validators
docs/             Development, QA, regression, and deployment playbooks
docker/           Production image definitions
scripts/          Local, deploy, QA, and smoke helpers
```

## Read First

- [docs/README.md](docs/README.md) - documentation map.
- [docs/CODEX_DEVELOPMENT_MANUAL.md](docs/CODEX_DEVELOPMENT_MANUAL.md) -
  canonical workflow for issues, branches, PRs, releases, and verification.
- [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) - local mock and real-backend smoke
  setup.
- [docs/PRODUCTION_QA_PLAYBOOK.md](docs/PRODUCTION_QA_PLAYBOOK.md) - full
  production regression process.
- [docs/ISSUE_AUTHORING_GUIDE.md](docs/ISSUE_AUTHORING_GUIDE.md) - required
  Kordi-style issue format.

## Prerequisites

- Node.js 20.19.x
- pnpm 9.x
- Docker Desktop for real backend/local DB testing

```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
pnpm install
```

## Local Development

Mock user-portal smoke, no DB and no real LLM:

```bash
pnpm build:shared
pnpm build:editor
pnpm dev:mock
pnpm dev:frontend-user
```

Open:

```text
http://localhost:3002/dev-bypass-login.html
```

Real backend track:

```bash
bash scripts/setup-env.sh
pnpm docker:up
pnpm build:shared
pnpm build:editor
pnpm dev:backend
pnpm dev:frontend-user
pnpm dev:frontend
```

Local URLs:

- Backend API: http://localhost:3001
- Admin dashboard: http://localhost:3000
- User portal: http://localhost:3002

## Common Commands

```bash
pnpm build:shared
pnpm build:editor
pnpm build:backend
pnpm build:frontend
pnpm build:frontend-user
pnpm build:tracker
pnpm build:all

pnpm test:backend
pnpm test:frontend-user
pnpm test:frontend
pnpm test
pnpm lint

pnpm docker:up
pnpm docker:down
pnpm docker:logs
```

Build order matters:

```text
shared -> editor -> tracker/backend/frontend/frontend-user
```

## Development Workflow

Humanly uses issue-driven development:

1. Create or reuse a GitHub issue.
2. Make the issue detailed enough to match
   [docs/ISSUE_AUTHORING_GUIDE.md](docs/ISSUE_AUTHORING_GUIDE.md).
3. Branch from the issue target branch.
4. Commit small logical slices.
5. Push and open a PR.
6. Run the right verification for the risk.
7. The user normally merges PRs unless they explicitly authorize automation.

Small related PRs can merge into an integration or release branch first, then a
single release PR lands in `main` and deploys production once. Docs-only pushes
to `main` are ignored by the production deploy workflow.

Full rules are in
[docs/CODEX_DEVELOPMENT_MANUAL.md](docs/CODEX_DEVELOPMENT_MANUAL.md).

## Production

Production runs on one GCP VM with Docker Compose. GitHub Actions builds three
images (`backend`, `frontend-user`, `frontend`), pushes commit-SHA tags to GCP
Artifact Registry, SSHes into the VM, pulls the exact images, runs migrations,
and restarts Compose services.

See [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md).

## Package Reference

- Backend auth/API notes:
  [packages/backend/AUTH_IMPLEMENTATION.md](packages/backend/AUTH_IMPLEMENTATION.md)
- Backend analytics:
  [packages/backend/ANALYTICS.md](packages/backend/ANALYTICS.md)
- Backend WebSocket:
  [packages/backend/WEBSOCKET.md](packages/backend/WEBSOCKET.md)
- Admin dashboard:
  [packages/frontend/README.md](packages/frontend/README.md)
- Tracker package:
  [packages/tracker/README.md](packages/tracker/README.md)

## License

MIT License.
