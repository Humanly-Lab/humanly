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
