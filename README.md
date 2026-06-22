# Humanly

<p align="center">
  <img alt="Humanly" src="./assets/humanly-readme-banner.gif" width="680">
</p>

<p align="center">
  <a href="#product">Product</a> ·
  <a href="#features">Features</a> ·
  <a href="#one-command-deployment">Self-Host</a> ·
  <a href="#certificates">Certificates</a> ·
  <a href="#architecture">Architecture</a>
</p>

<p align="center">
  <a href="https://app.writehumanly.net/"><img alt="Writer Portal" src="https://img.shields.io/badge/writehumanly.net-app-7fa184?style=for-the-badge"></a>
  <a href="https://github.com/ShenzheZhu/humanly/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/ShenzheZhu/humanly?label=release&color=c49a6c&style=for-the-badge"></a>
  <img alt="Frontend stack" src="https://img.shields.io/badge/TypeScript%20%2F%20Next.js-frontend-7b9fb8?style=for-the-badge">
  <img alt="Backend stack" src="https://img.shields.io/badge/Express%20%2F%20PostgreSQL-backend-b79a8b?style=for-the-badge">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-9aa77d?style=for-the-badge"></a>
</p>

**Write with AI. Prove your process.**

Humanly is a writing provenance platform for human-AI work. It gives writers a
controlled workspace for drafting with configurable AI support, and it gives
reviewers a certificate that shows how the writing process unfolded.

<p align="center">
  <img src="./assets/humanly-product-hero.svg" alt="Humanly writing workspace with PDF context, editor, and AI assistant" width="960" />
</p>

## Product

Humanly has two first-party web apps:

- **Writer Portal:** [app.writehumanly.net](https://app.writehumanly.net/) for
  personal writing, assigned tasks, PDF-backed writing, AI-assisted drafting,
  submissions, and certificates.
- **Publisher Portal:** [admin.writehumanly.net](https://admin.writehumanly.net/)
  for creating tasks, configuring writing environments, distributing share
  links, reviewing submissions, and inspecting certificates.

## Features

- **Configurable writing environments** for personal writing and assigned
  tasks, including AI access, copy-paste rules, time limits, instructions, PDF
  access, and task attempts.
- **AI policy controls** that can disable AI, allow only selected-text polish,
  allow only chat, or allow full in-platform assistance.
- **Process tracing** for typing, editing, copy/paste, focus, navigation,
  workspace activity, and in-platform AI interactions.
- **PDF context** so writers can draft beside source material and use approved
  AI support over uploaded PDFs.
- **Task distribution** through invite codes and public share links, including
  account or guest participation depending on the task setting.
- **Shareable certificates** with authorship statistics, replay, environment
  settings, abnormal-behavior review signals, and integrity details.

## One Command Deployment

Create and start a full local Humanly stack without cloning the repository or
installing Node.js first:

```bash
curl -fsSL https://raw.githubusercontent.com/ShenzheZhu/humanly/main/scripts/install.sh | sh
```

The installer checks Docker and Docker Compose, installs them on supported
hosts when possible, downloads the Humanly source code, generates local secrets,
writes a Docker Compose quickstart, seeds a local Publisher Portal admin
account, and starts the services. Email is local-only with
`EMAIL_SERVICE=console`; no SMTP, SendGrid, Resend, S3, or other third-party
service is required for local use.

Then open:

- Publisher Portal: `http://localhost:3000`
- Writer Portal: `http://localhost:3002`
- Backend API: `http://localhost:3001`

Default local admin account:

```text
Email:    admin@mail.com
Password: admin123456
```

Manage the local stack from the generated directory:

```bash
cd humanly
./humanly status
./humanly stop
./humanly start
./humanly upgrade
./humanly uninstall
```

To install without starting Docker immediately:

```bash
curl -fsSL https://raw.githubusercontent.com/ShenzheZhu/humanly/main/scripts/install.sh | sh -s -- --no-start
```

The npm installer remains available for Node-based workflows:

```bash
npx create-humanly@latest
```

If you already cloned this repository and want to run the checked-out code
directly:

```bash
docker compose -f docker-compose.quickstart.yml up --build
```

For manual setup, environment variables, and persistent self-deployment notes,
see [docs/SELF_DEPLOY.md](https://github.com/ShenzheZhu/humanly/blob/main/docs/SELF_DEPLOY.md).

## Certificates

A Humanly certificate can show:

- the submitted document and final text statistics;
- the writing environment and task rules active during writing;
- authorship statistics for typed, pasted, and AI-assisted text;
- event logs for writing, navigation, copy/paste, and AI activity;
- replay and abnormal-behavior review signals where available;
- certificate integrity details.

Certificates are evidence for review. They describe what happened inside the
Humanly workspace and do not make claims about off-platform behavior.

## Architecture

Humanly is a pnpm workspace with one backend service, two Next.js apps, and
shared packages for the writing editor, tracking, and cross-app types.

```text
packages/backend        Express API, storage, events, certificates, AI
packages/frontend       Publisher Portal
packages/frontend-user  Writer Portal and writing workspace
packages/editor         Writing editor
packages/tracker        External-form tracking library
packages/shared         Shared types and utilities
```

Local and production deployments use PostgreSQL for durable data, Redis for
cache and realtime support, and file/object storage for uploaded PDFs and
attachments.

## Links

- Release notes: [CHANGELOG.md](CHANGELOG.md)
- Self-deployment guide: [docs/SELF_DEPLOY.md](docs/SELF_DEPLOY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- License: [MIT](LICENSE)
