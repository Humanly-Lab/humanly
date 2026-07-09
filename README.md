<p align="center">
  <img alt="Humanly" src="./assets/humanly-readme-banner.png" width="600">
</p>

<p align="center">
  <strong>A Configurable and Traceable Environment for Human-AI Collaborative Writing.</strong>
</p>

<p align="center">
  <a href="#product">Product</a> ·
  <a href="#features">Features</a> ·
  <a href="#one-command-deployment">Self-Host</a> ·
  <a href="#development">Development</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#research-artifacts">Research</a>
</p>

<p align="center">
  <a href="https://app.writehumanly.net/"><img alt="Writer Portal" src="https://img.shields.io/badge/app-writehumanly.net-6f6a60?style=flat&logo=vercel&logoColor=white"></a>
  <a href="https://github.com/Humanly-Lab/humanly/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Humanly-Lab/humanly?style=flat&logo=github&logoColor=white&color=8b7a8f"></a>
  <img alt="Frontend stack" src="https://img.shields.io/badge/frontend-Next.js%20%2F%20TypeScript-71879b?style=flat&logo=nextdotjs&logoColor=white">
  <img alt="Backend stack" src="https://img.shields.io/badge/backend-Express%20%2F%20PostgreSQL-9c8068?style=flat&logo=postgresql&logoColor=white">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-8b8675?style=flat&logo=opensourceinitiative&logoColor=white"></a>
</p>

Humanly is a writing provenance platform for human-AI collaboration. Writers
draft inside an owner-configured environment while Humanly records the process
as it happens. The resulting certificate lets readers inspect how the document
was produced instead of inferring authorship from the final text alone.

<p align="center">
  <img src="./assets/humanly-product-hero.png" alt="Humanly writing workspace with PDF context, editor, and AI assistant" width="960" />
</p>

## Product

Humanly has two first-party web apps and a public certificate surface:

- **Writer Portal:** [app.writehumanly.net](https://app.writehumanly.net/) for
  personal writing, assigned tasks, PDF-backed writing, AI-assisted drafting,
  submissions, and certificates.
- **Publisher Portal:** [admin.writehumanly.net](https://admin.writehumanly.net/)
  for creating tasks, configuring writing environments, distributing share
  links, reviewing submissions, and inspecting certificates.
- **Certificate verification:** shareable certificate URLs expose only the
  display fields selected by the certificate owner and verify the integrity
  seal attached to the record.

## Features

- **Configurable writing environments** for personal writing and assigned
  tasks, including AI policy, copy-paste rules, timing, length bounds, writing
  instructions, PDF access, detectors, and assigned-task attempt rules.
- **AI policy controls** that can disable AI, allow only selected-text polish,
  allow only chat, or allow full in-platform assistance.
- **Process tracing** for typing, editing, copy/paste, focus, navigation,
  workspace activity, and in-platform AI interactions.
- **Task distribution** through invite codes and public share links, including
  account or guest participation depending on the task setting.
- **Shareable certificates** with authorship statistics, replay, environment
  settings, anomaly behavior review signals, and integrity seal details.

## One Command Deployment

Create and start a full local Humanly stack without cloning the repository or
installing Node.js first:

```bash
curl -fsSL https://writehumanly.net/install.sh | sh
```

The installer checks Docker and Docker Compose, installs them on supported
hosts when possible, downloads the Humanly source code, generates local secrets,
writes a Docker Compose quickstart, seeds a local Publisher Portal admin
account, and starts the services. Email is local-only with
`EMAIL_SERVICE=console`; no SMTP, SendGrid, Resend, S3, or other third-party
service is required for local use.

The local stack also starts the inference service used by the Humanly Typing
Detector. Private detector weights are not bundled; when `model.joblib` is not
mounted, the stack still starts and detector requests return an inconclusive
result instead of blocking local use.

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
./humanly restart
./humanly upgrade
./humanly uninstall
```

To install without starting Docker immediately:

```bash
curl -fsSL https://writehumanly.net/install.sh | sh -s -- --no-start
```

If the website installer endpoint is unavailable, use the repository fallback:

```bash
curl -fsSL https://raw.githubusercontent.com/Humanly-Lab/humanly/main/scripts/install.sh | sh
```

If you already cloned this repository and want to run the checked-out code
directly:

```bash
docker compose -f docker-compose.quickstart.yml up --build
```

For manual setup, environment variables, and persistent self-deployment notes,
see [docs/SELF_DEPLOY.md](docs/SELF_DEPLOY.md).

## Development

Source development requires Node.js 20.19, pnpm 9, Docker, and Docker Compose.

```bash
git clone https://github.com/Humanly-Lab/humanly.git
cd humanly
corepack enable
pnpm install --frozen-lockfile
pnpm setup:local
```

Start the applications in separate terminals:

```bash
pnpm dev:backend        # http://localhost:3001
pnpm dev:frontend       # http://localhost:3000
pnpm dev:frontend-user  # http://localhost:3002
```

Run the repository quality gates before opening a pull request:

```bash
pnpm type-check
pnpm test:runnable
pnpm build:all
```

## Architecture

Humanly is a pnpm workspace with an Express backend, a Python inference service,
two Next.js apps, and shared packages for the writing editor, tracking, and
cross-app types.

```text
packages/backend        Express API, storage, events, certificates, AI
packages/inference      FastAPI model inference service
packages/frontend       Publisher Portal
packages/frontend-user  Writer Portal and writing workspace
packages/editor         Writing editor
packages/tracker        External-form tracking library
packages/shared         Shared types and utilities
packages/create-humanly Self-host installer package
```

Local and production deployments use PostgreSQL for durable data, Redis for
cache and realtime support, file/object storage for uploaded PDFs and
attachments, and optional detector weights for model inference.

## Research Artifacts

The public research materials used to evaluate and document Humanly live under
[`paper-artifacts/`](paper-artifacts/):

- [User study survey questions](paper-artifacts/user-study-survey-questions.md)
- [LLM-as-judge prompt](paper-artifacts/llm-as-judge-prompt.md)
- [Red-team Codex prompts](paper-artifacts/red-team-codex-prompts.md)

## Links

- Self-deployment guide: [docs/SELF_DEPLOY.md](docs/SELF_DEPLOY.md)
- npm installer: [create-humanly](https://www.npmjs.com/package/create-humanly)
- Latest release: [GitHub Releases](https://github.com/Humanly-Lab/humanly/releases/latest)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- License: [MIT](LICENSE)
