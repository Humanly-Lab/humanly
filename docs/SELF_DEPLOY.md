# Self-Deploy Humanly

This guide covers the minimum setup for running Humanly on your own server.

## Requirements

- Node.js 20
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
AI_PROVIDER=mock
AI_API_KEY=
AI_ENCRYPTION_KEY=<32-byte-hex-key>
```

For production, replace the local URLs with your deployed admin and user portal
domains, set a real AI provider key if AI assistance is enabled, and store all
secrets outside the repository.

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

- Admin dashboard: `http://localhost:3000`
- User portal: `http://localhost:3002`
- Backend API: `http://localhost:3001`

## Build

```bash
pnpm build:all
```

The backend runs database migrations at startup. Keep PostgreSQL, Redis, and file
storage persistent across restarts so documents, events, certificates, and
uploads are retained.
