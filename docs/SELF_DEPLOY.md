# Self-Deploy Humanly

This guide covers the minimum setup for running Humanly on your own server.

## One-Command Local Quickstart

For a local self-hosted demo, check and install runtime prerequisites before
running the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/ShenzheZhu/humanly/main/packages/create-humanly/scripts/install-prereqs.sh | bash
```

Then use the installer instead of cloning the repository manually:

```bash
npx create-humanly@latest
```

This creates a `humanly/` directory, downloads the source code, generates local
secrets, writes `docker-compose.yml`, seeds a default Publisher Portal admin,
and starts the stack. Node.js and npm are required before running the installer
because `npx` runs on Node. The prerequisite script checks Node/npm, Docker,
Docker Compose, and the Docker daemon before `npx create-humanly@latest` runs.

Local quickstart does not require a third-party email provider. It uses
`EMAIL_SERVICE=console`, so signup and notification messages are written to
backend logs. Uploads use local Docker storage by default.

Default local URLs:

- Publisher Portal: `http://localhost:3000`
- Writer Portal: `http://localhost:3002`
- Backend API: `http://localhost:3001`

Default local admin account:

```text
Email:    admin@mail.com
Password: admin123456
```

To stop or reset:

```bash
cd humanly
docker compose -f docker-compose.yml down
docker compose -f docker-compose.yml down -v
```

## Manual Requirements

- Node.js 20.19 or newer
- pnpm 9
- Docker and Docker Compose
- PostgreSQL, Redis, and persistent file storage

## Environment

Create backend environment variables before starting the services:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/humanly
REDIS_URL=redis://localhost:6379
JWT_SECRET=<random-hex-secret>
CORS_ORIGIN=http://localhost:3000,http://localhost:3002
FRONTEND_USER_URL=http://localhost:3002
AI_ENCRYPTION_KEY=<32-byte-hex-key>
AI_AGENT_MAX_TOOL_CALLS=60
AI_PROVIDER_TIMEOUT_MS=180000
```

For production, replace the local URLs with your deployed Publisher Portal and
Writer Portal domains. Humanly does not use a backend-owned AI provider key;
users configure their own provider credentials in the product, and those
credentials are stored encrypted.

## Install

```bash
pnpm install
pnpm docker:up
pnpm build:shared
pnpm build:editor
```

## Run Locally

Start the services in separate terminals:

```bash
pnpm dev:backend
pnpm dev:frontend
pnpm dev:frontend-user
```

Default local URLs:

- Publisher Portal: `http://localhost:3000`
- Writer Portal: `http://localhost:3002`
- Backend API: `http://localhost:3001`

## Build

```bash
pnpm build:all
```

The backend runs database migrations at startup. Keep PostgreSQL, Redis, and file
storage persistent across restarts so documents, events, certificates, and
uploads are retained.
