# Humanly Publisher Portal

This package is the Next.js Publisher Portal served at
https://admin.writehumanly.net/ in production and http://localhost:3000 locally.

Use the repo root for installs and shared builds:

```bash
pnpm install
pnpm build:shared
pnpm dev:frontend
```

Environment variables:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
NEXT_PUBLIC_TRACKER_URL=http://localhost:3001
```

Primary routes:

- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/tasks`
- `/tasks/new`
- `/tasks/[id]`
- `/tasks/[id]/analytics`
- `/tasks/[id]/enrollments`
- `/tasks/[id]/enrollments/[userId]`
- `/tasks/[id]/submissions/[submissionId]`
- `/tasks/[id]/settings`

Reference docs:

- Project overview: `../../README.md`
- Self-deployment guide: `../../docs/SELF_DEPLOY.md`
