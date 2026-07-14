# Humanly Enterprise Server

> [!WARNING]
> The software in this directory is licensed under the
> [PolyForm Free Trial License 1.0.0](LICENSE). This is **not an open-source
> license**. The license permits use only to evaluate whether the software suits
> a particular application for less than 32 consecutive calendar days. A
> commercial license is required for use outside those terms. Contact
> [support@writehumanly.net](mailto:support@writehumanly.net) for commercial
> licensing.

> [!WARNING]
> Humanly Enterprise Server is under active development. The code in this
> directory may contain incomplete features, bugs, or breaking changes.

This directory contains source-visible commercial components used to compose
Humanly Cloud and future institution-ready deployments. For the MIT-licensed
Humanly Community core, see the [repository root](../README.md).

## How Enterprise extends Community

Humanly ships Community and Cloud from one application codebase:

- Public interfaces and default implementations live under `packages/` and are
  licensed under MIT.
- Commercial implementations live under `ee/` and may depend on public core
  packages through the `@humanly-ee/*` namespace.
- Core packages must not import from `ee/`. Enterprise modules are registered at
  explicit composition points through the shared edition registry.
- Features that replace core behavior use a core-owned hook or provider
  interface. Edition checks belong at registration points, not throughout the
  core implementation.

This structure keeps Community usable on its own while allowing Cloud to add
commercial capabilities without maintaining a separate application fork.

## Deciding what belongs here

Depending on an external service does not, by itself, make a feature
Enterprise-only. The boundary is based on product responsibility:

1. A capability required for a complete self-hosted Humanly workflow belongs
   in Community, together with its public interface and a usable default
   implementation.
2. Organization governance, managed-service operations, commercial
   entitlements, and paid implementations belong in `ee/`.
3. Credentials, production topology, customer configuration, and managed model
   artifacts belong in private infrastructure, never in this public directory.

The intended split is:

| Area | Community responsibility | Enterprise extension |
| --- | --- | --- |
| Accounts and authentication | Local accounts, password hashing, sessions, email verification, password reset, and configurable OAuth | Organization SSO/SAML/OIDC policy, SCIM provisioning, domain claims, centralized session policy, and service accounts |
| Email | Generic delivery contract and self-hosted configuration for account lifecycle messages | Organization invitations, billing and quota alerts, tenant branding, delivery telemetry, suppression, and bounce handling |
| AI | Provider interfaces, bring-your-own-key configuration, and in-platform AI use | Humanly-managed credits, tenant quotas, metering, and entitlement enforcement |
| APIs | Product APIs required by a self-hosted deployment | Managed API keys, tenant-scoped service accounts, production quotas, higher-throughput plans, and SLA-backed access |
| Storage and data | Configurable storage plus the writing, event, and certificate data model | Tenant quotas, retention policy, legal hold, organization audit export, and managed storage operations |
| Typing detector | Public detector contract and bring-your-own inference endpoint | Humanly-managed detector client and entitlement checks; private weights and serving configuration remain outside this repository |
| Organizations | None required for the Community account lifecycle | Workspaces, RBAC, organization administration, governance, and consolidated usage |
| Institution integrations | Public extension points and Community-compatible adapters | Managed LMS/SIS connectors, provisioning, deployment support, and custom integrations |

Humanly Community is a multi-user self-hosted web application, so its account
lifecycle cannot depend on Enterprise code. In particular, moving password
reset or verification email delivery into `ee/` would leave Community unable to
operate safely in production. Enterprise extends those foundations with
organization identity and managed delivery operations; it does not replace the
base account flow.

This differs from projects whose Community edition is a local single-user
application. OpenHands, for example, documents Enterprise authentication and
SMTP in the context of OAuth, organization invitations, and budget alerts. The
reusable pattern is the extension boundary, not the mechanical placement of all
authentication or email code in an Enterprise directory. See the
[OpenHands Enterprise README](https://github.com/OpenHands/OpenHands/blob/main/enterprise/README.md).

## Current contents

- [`packages/billing/`](packages/billing/) is the initial Enterprise package. It
  provides the Cloud billing-plan route and the current billing UI boundary.
- [`migrations/`](migrations/) contains Enterprise database migrations that run
  after the Community migrations in Cloud deployments.
- [`docker/`](docker/) contains Cloud edition image definitions that compose the
  Community application with Enterprise packages.

These are the only Enterprise capabilities documented here today. Features
such as production billing integrations, organization management, SSO, RBAC,
and entitlement enforcement are not claimed by this README.

## Planned commercial modules

The following are ownership decisions, not claims of current availability:

- organization workspaces, RBAC, SSO/SAML/OIDC policy, SCIM, and domain claims;
- production billing, plans, usage metering, quotas, and entitlement checks;
- managed API credentials, service accounts, rate tiers, and webhooks;
- organization invitations, tenant-branded notifications, billing alerts, and
  delivery operations;
- multi-tenant storage policy, audit exports, retention, and governance;
- managed LMS/SIS integrations, onboarding, deployment support, and custom
  connectors; and
- managed typing-detector glue and entitlement checks, to be transferred no
  earlier than 2026-08-04. Model weights and serving configuration remain
  private operational artifacts.

## Private operational boundary

The public `ee/` directory is a licensing boundary, not a secrets boundary.
Production credentials, customer configuration, managed model weights, and
private deployment controls must remain in the private Humanly Cloud control
plane or approved private storage. They must never be committed here.

## Licensing

Code outside `ee/` is licensed under the repository's [MIT license](../LICENSE).
Code in `ee/` is licensed separately under the
[PolyForm Free Trial License 1.0.0](LICENSE). Source visibility does not grant
open-source rights or permission to distribute the Enterprise software.

Product availability is described at
[writehumanly.net/pricing](https://writehumanly.net/pricing).
