# Humanly

Humanly is a traceable, AI-native writing platform. It records how a document
is written inside a controlled workspace and turns that process into a
shareable writing certificate.

Instead of relying only on final-text judgment, Humanly focuses on provenance:
the writing environment, the writer's activity, in-platform AI use, and the
evidence attached to the final document.

## Links

- User portal: [app.writehumanly.net](https://app.writehumanly.net/)
- Admin dashboard: [admin.writehumanly.net](https://admin.writehumanly.net/)
- Latest release: [v0.4.0](https://github.com/ShenzheZhu/humanly/releases/tag/v0.4.0)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- License: [MIT](LICENSE)

## What Humanly Does

Humanly provides a writing workspace where AI access, copy-paste behavior,
resources, timing, submission mode, and tracking can be configured for different
writing situations.

During writing, Humanly records the process behind the document, including text
creation activity, workspace activity, and approved in-platform AI assistance.
After writing, the user can generate a certificate that summarizes the session
and can be shared for public verification.

## Writing Certificates

A Humanly certificate can show:

- authorship statistics,
- the active writing environment,
- a replay of the writing trajectory,
- review signals for unusual activity,
- and a server-issued integrity seal.

Certificates are evidence for review. They describe what happened inside the
Humanly workspace and do not make claims about off-platform behavior.

## Repository

This repository contains the Humanly product code:

```text
packages/backend        API, storage, events, certificates, AI
packages/frontend       Admin dashboard
packages/frontend-user  User portal and writing workspace
packages/editor         Writing editor
packages/tracker        External-form tracking library
packages/shared         Shared types
docs/                   Maintainer and deployment documentation
```

For setup, QA, deployment, and maintainer documentation, see
[docs/README.md](docs/README.md).
