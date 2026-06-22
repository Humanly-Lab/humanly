# Self-Deploy Humanly

This guide covers the minimum setup for running Humanly on your own server.

## One-Command Local Quickstart

For a local self-hosted demo, use the shell installer instead of cloning the
repository manually:

```bash
curl -fsSL https://raw.githubusercontent.com/ShenzheZhu/humanly/main/scripts/install.sh | sh
```

This creates a `humanly/` directory, checks or installs Docker and Docker
Compose on supported hosts, downloads the source code, generates local secrets,
writes `docker-compose.yml`, seeds a default Publisher Portal admin, and starts
the stack. Node.js and npm are not required for this path.

Local quickstart does not require a third-party email provider. It uses
`EMAIL_SERVICE=console`, so signup and notification messages are written to
backend logs. Uploads use local Docker storage by default.

To install files without starting services:

```bash
curl -fsSL https://raw.githubusercontent.com/ShenzheZhu/humanly/main/scripts/install.sh | sh -s -- --no-start
```

Default local URLs:

- Publisher Portal: `http://localhost:3000`
- Writer Portal: `http://localhost:3002`
- Backend API: `http://localhost:3001`

Default local admin account:

```text
Email:    admin@mail.com
Password: admin123456
```

Manage the local install:

```bash
cd humanly
./humanly status
./humanly stop
./humanly start
./humanly restart
./humanly upgrade
./humanly uninstall
```

The npm installer remains available for Node-based workflows:

```bash
npx create-humanly@latest
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
