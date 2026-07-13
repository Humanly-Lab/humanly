# Humanly Enterprise Edition

The `ee/` directory contains source-visible implementations used by Humanly
Cloud and future commercially licensed deployments. Humanly Community and
Humanly Cloud are built from this repository so shared product behavior stays
in one codebase.

Code outside `ee/` is licensed under the root MIT license. Code under `ee/` is
licensed separately under [`ee/LICENSE`](LICENSE). The Enterprise Edition
license is currently pending legal review; do not treat the source visibility
of this directory as an open-source license grant.

Enterprise packages use the `@humanly-ee/*` namespace and may depend on
`@humanly/*` packages. Core packages under `packages/` must not import from
`ee/`.

Product availability is described at
[writehumanly.net/pricing](https://writehumanly.net/pricing).
