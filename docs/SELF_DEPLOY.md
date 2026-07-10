# Self-Deploy Humanly

This guide covers the minimum setup for running Humanly on your own server.

## One-Command Local Quickstart

For a local self-hosted demo, use the shell installer instead of cloning the
repository manually:

```bash
curl -fsSL https://writehumanly.net/install.sh | sh
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
curl -fsSL https://writehumanly.net/install.sh | sh -s -- --no-start
```

If the website installer endpoint is unavailable, use the repository fallback:

```bash
curl -fsSL https://raw.githubusercontent.com/Humanly-Lab/humanly/main/scripts/install.sh | sh
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

Certificate integrity seals use Ed25519 signatures. For local installs, Humanly
can derive a stable signing key from `JWT_SECRET`. For production, set
`CERTIFICATE_ED25519_PRIVATE_KEY`, `CERTIFICATE_ED25519_PUBLIC_KEY`, and
`CERTIFICATE_ED25519_KEY_ID` so new certificates remain publicly verifiable
across deployments.

## Production PDF Delivery

Local storage serves authenticated PDF range requests through the backend. A
production GCS deployment can authorize the viewer once, then let PDF.js read
the file directly from a short-lived GCS V4 signed URL:

```bash
FILE_STORAGE_PROVIDER=gcs
GCS_BUCKET_NAME=humanly-prod-pdfs
GCS_SIGNED_URLS_ENABLED=true
GCS_SIGNED_URL_TTL_SECONDS=900
```

The backend still performs the normal user, document-scoped guest, enrollment,
and view-only checks before issuing a URL. View-only files also require the
existing single-file view token. If signing is disabled, unavailable, or the
browser cannot load the signed URL, the Writer Portal falls back to the
authenticated backend range proxy.

Configure bucket CORS for the Writer Portal origin so PDF.js can issue `GET`
and byte-range requests and inspect the response headers. Replace the origin
and bucket name before applying this example:

```json
[
  {
    "origin": ["https://app.writehumanly.net"],
    "method": ["GET", "HEAD"],
    "responseHeader": [
      "Accept-Ranges",
      "Content-Length",
      "Content-Range",
      "Content-Type"
    ],
    "maxAgeSeconds": 3600
  }
]
```

```bash
gcloud storage buckets update gs://humanly-prod-pdfs --cors-file=cors.json
```

The backend service account must be able to read bucket objects and sign URLs.
With Workload Identity, grant the signer the required `iam.serviceAccounts.signBlob`
permission, commonly through `roles/iam.serviceAccountTokenCreator` on the
signing service account.

Signed URLs are bearer credentials. Humanly does not log their query strings,
returns the view contract with `Cache-Control: private, no-store`, and limits
the configured lifetime to 60-3600 seconds. Removing application access stops
new URLs from being issued, but an already-issued URL remains usable until it
expires. Keep the TTL short enough for that revocation window and long enough
for normal PDF reading sessions.

Before enabling signed delivery broadly, compare the signed path with the API
proxy in browser network tools using the same PDF. Record time to first page,
request TTFB, range-request count, and bytes transferred. Confirm `206 Partial
Content` responses, test an enrolled writer and a document-scoped guest, test a
view-only PDF, and temporarily disable bucket CORS to verify the proxy fallback.

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
