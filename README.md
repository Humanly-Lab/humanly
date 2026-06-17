# ✏️ Humanly: Human-AI Writing Environments with Process Tracing and Certificates
<p align="center">
  <img alt="Humanly" src="./assets/humanly-readme-banner.gif" width="680">
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#product">Product</a> ·
  <a href="#self-host-quick-start-tldr">Self-Host</a> ·
  <a href="#certificates">Certificates</a> ·
  <a href="#repository">Repository</a>
</p>

<p align="center">
  <a href="https://app.writehumanly.net/"><img alt="User portal" src="https://img.shields.io/badge/writehumanly.net-app-7fa184?style=for-the-badge"></a>
  <a href="https://github.com/ShenzheZhu/humanly/releases/tag/v0.4.0"><img alt="Release" src="https://img.shields.io/badge/release-v0.4.0-c49a6c?style=for-the-badge"></a>
  <img alt="Frontend stack" src="https://img.shields.io/badge/TypeScript%20%2F%20Next.js-frontend-7b9fb8?style=for-the-badge">
  <img alt="Backend stack" src="https://img.shields.io/badge/Express%20%2F%20PostgreSQL-backend-b79a8b?style=for-the-badge">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-9aa77d?style=for-the-badge"></a>
</p>

<h2 id="overview">Overview</h2>

Humanly is a writing platform that records how a document is produced inside a
controlled workspace. It focuses on provenance: the writing environment, the
writer's activity, in-platform AI use, and the evidence attached to the final
document. Instead of only judging final text, Humanly turns the writing process into a
shareable certificate.

<h2 id="product">Product</h2>

- Configurable writing workspaces for personal writing and assigned tasks.
- In-platform AI modes for off, polish-only, chat-only, or full assistance.
- Process tracing for writing activity, workspace activity, and AI interaction.
- Workspace preview before a task or document begins.
- Public certificate links for review and verification.

Live product:

- User portal: [writehumanly.net](https://app.writehumanly.net/)
- Admin dashboard: [admin.writehumanly.net](https://admin.writehumanly.net/)

<h2 id="self-host-quick-start-tldr">Self-Host quick start (TL;DR)</h2>

Requirements: Node.js 20, pnpm 9, Docker, PostgreSQL, Redis, and persistent file
storage.

```bash
pnpm install
bash scripts/setup-env.sh
pnpm docker:up
pnpm build:shared
pnpm build:editor
```

Then start the three services in separate terminals:

```bash
pnpm dev:backend
pnpm dev:frontend
pnpm dev:frontend-user
```

Default local URLs:

- Admin dashboard: `http://localhost:3000`
- User portal: `http://localhost:3002`
- Backend API: `http://localhost:3001`

For more details, see [docs/SELF_DEPLOY.md](https://github.com/ShenzheZhu/humanly/blob/main/docs/SELF_DEPLOY.md).

<h2 id="certificates">Certificates</h2>

A Humanly certificate can show authorship statistics, the active writing
environment, replay, review signals, and certificate integrity details.

Certificates are evidence for review. They describe what happened inside the
Humanly workspace and do not make claims about off-platform behavior.

<h2 id="repository">Repository</h2>

This repository contains the Humanly product code.

```text
packages/backend        API, storage, events, certificates, AI
packages/frontend       Admin dashboard
packages/frontend-user  User portal and writing workspace
packages/editor         Writing editor
packages/tracker        External-form tracking library
packages/shared         Shared types
docs/                   Self-deployment guide
```

Release notes are tracked in [CHANGELOG.md](CHANGELOG.md).
