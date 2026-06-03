# Production Deployment

Humanly production stays on the existing single GCP VM and Docker Compose
runtime. GitHub Actions now builds application images and pushes them to GCP
Artifact Registry. The VM only pulls prebuilt images and restarts Compose
services.

This change does not migrate PostgreSQL to Cloud SQL, does not add Cloud
Storage, and does not introduce Kubernetes, GKE, or Cloud Run.

## Deployment Flow

```text
product push to main
  -> GitHub Actions cancels older in-progress production deploy runs
  -> GitHub Actions detects which app surfaces changed
  -> GitHub Actions builds only affected backend, frontend-user, and/or frontend images
  -> GitHub Actions uses Docker Buildx layer cache for repeated builds
  -> GitHub Actions pushes commit-SHA tags for rebuilt images to Artifact Registry
  -> GitHub Actions SSHes into the production VM
  -> VM syncs the deploy files from main
  -> VM runs scripts/deploy.sh with exact image tags for changed services
  -> VM preserves existing image tags for unchanged services
  -> docker compose pulls changed application images
  -> VM runs pending SQL migrations when backend changes
  -> docker compose up -d restarts changed app services and nginx
  -> deploy script expands TLS cert SANs when needed and restarts nginx
  -> GitHub Actions verifies app/admin/api health endpoints over HTTPS
```

Docs-only pushes to `main` are ignored by `.github/workflows/deploy.yml`.
Related small product PRs can be merged into an `integration/<theme>` or
`release/<theme>` branch first, then shipped through one final PR to `main` so
production deploys once.

Selective deploy rules are conservative:

- `packages/backend/**`, `packages/tracker/**`, backend Dockerfile, or backend
  deploy inputs rebuild/restart `backend`.
- `packages/frontend-user/**`, `packages/editor/**`, or the user-portal
  Dockerfile rebuild/restart `frontend-user`.
- `packages/frontend/**` or the admin Dockerfile rebuild/restart `frontend`.
- `packages/shared/**`, workspace manifests, lockfile, root TypeScript config,
  Compose file, or deploy workflow/script changes rebuild all three app images.
- nginx/certificate-only changes can deploy without rebuilding app images; the
  VM keeps the previous image tags and recreates nginx.

Production service compatibility is unchanged:

- `backend` still listens on port `3001` inside the Compose network.
- `frontend-user` still listens on port `3002` inside the Compose network.
- `frontend` listens on port `3000` inside the Compose network and is served
  from `admin.writehumanly.net`.
- `nginx` routes `writehumanly.net` and `app.writehumanly.net` to `frontend-user` and
  `admin.writehumanly.net` to `frontend`. `api.writehumanly.net` is the
  supported direct API/tracker hostname. All four hostnames proxy `/api`,
  `/health`, `/tracker/`, and `/socket.io/` to `backend`.
- `postgres`, `redis`, volumes, networks, health checks, and backend `.env`
  behavior are preserved.

## Production Domains

Production uses the apex domain for public marketing plus service subdomains:

- `writehumanly.net`: public homepage, served by `frontend-user`.
- `app.writehumanly.net`: end-user portal (`frontend-user`).
- `admin.writehumanly.net`: admin dashboard (`frontend`).
- `api.writehumanly.net`: direct API, tracker, health, and Socket.IO host.

All records should point at the production VM external IP:

```text
Type: A
Name: @
Value: 34.30.217.221

Type: A
Name: app
Value: 34.30.217.221

Type: A
Name: admin
Value: 34.30.217.221

Type: A
Name: api
Value: 34.30.217.221
```

The TLS certificate mounted at `nginx/ssl/fullchain.pem` must also include
`writehumanly.net`, `app.writehumanly.net`, `admin.writehumanly.net`, and
`api.writehumanly.net`.
Docker Compose nginx is the only production owner of ports `80` and `443`.
Do not use host-level certbot nginx renewal on this VM.

`scripts/deploy.sh` calls `scripts/ensure-production-cert.sh` after nginx is
running; the script expands the Let's Encrypt certificate when a supported
hostname is missing from the certificate SAN and renews it when it is inside the
`CERTBOT_RENEWAL_WINDOW_DAYS` window, defaulting to 30 days. The script uses
Docker certbot with the Compose webroot at `nginx/certbot`, so it does not need
to bind `80` or `443`.

Deploys also disable the obsolete host `certbot.timer` and `certbot.service`
when the deploy user has root or passwordless sudo. This prevents host certbot
from trying to start host nginx and colliding with Docker nginx.

Manual certificate repair from the VM:

```bash
cd /home/humanly/humanly
bash scripts/ensure-production-cert.sh
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate nginx
```

Dry-run renewal check from the VM:

```bash
cd /home/humanly/humanly
CERTBOT_DRY_RUN=1 bash scripts/ensure-production-cert.sh
```

If host certbot units are still present after an older deploy, disable them once:

```bash
sudo systemctl disable --now certbot.timer certbot.service
sudo systemctl reset-failed certbot.service
```

Validate HTTPS after any certificate repair:

```bash
curl -fsS https://app.writehumanly.net/health
curl -fsS https://writehumanly.net/health
curl -fsS https://admin.writehumanly.net/health
curl -fsS https://api.writehumanly.net/health
curl -fsS https://api.writehumanly.net/api/v1/health
```

## Production SSH Access

Canonical deploy access is the GitHub Actions secret triplet `VM_HOST`,
`VM_USER`, and `VM_SSH_KEY`. Do not rotate or remove that key during operator
SSH repair unless the deployment workflow is updated in the same change.

Canonical operator debug access is:

```bash
gcloud compute ssh zhu@humanly-project \
  --project hai-gcp-representation \
  --zone us-central1-f
```

If metadata contains the expected SSH key but `gcloud compute ssh` returns
`Permission denied (publickey)`, repair the VM guest user from a workstation
with GCP permissions:

```bash
cd humanly-code
OPERATOR_USER=zhu \
OPERATOR_PUBLIC_KEY_FILE="$HOME/.ssh/google_compute_engine.pub" \
scripts/repair-production-ssh-access.sh
```

This break-glass script installs the operator public key through a one-shot GCE
startup script, resets the VM so the startup script runs, verifies SSH, removes
the startup script metadata, and disables host certbot units. It stores only a
public key in metadata; it never prints or uploads private key material.

Browser SSH depends on the guest OS materializing fresh metadata keys for the
browser session. If browser SSH fails but canonical operator SSH works, use the
operator path above and repair/restart the GCE guest agent during the next
maintenance window.

## Required GCP Setup

Set these shell variables before running the commands:

```bash
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="northamerica-northeast1"
export GCP_ARTIFACT_REPOSITORY="humanly"
export GITHUB_REPOSITORY="OWNER/REPO"
export DEPLOYER_SA_NAME="humanly-github-deployer"
export VM_RUNTIME_SA_NAME="humanly-vm-runtime"
```

Enable required APIs:

```bash
gcloud services enable artifactregistry.googleapis.com iamcredentials.googleapis.com \
  --project "$GCP_PROJECT_ID"
```

Create the Artifact Registry Docker repository:

```bash
gcloud artifacts repositories create "$GCP_ARTIFACT_REPOSITORY" \
  --project "$GCP_PROJECT_ID" \
  --repository-format docker \
  --location "$GCP_REGION" \
  --description "Humanly production Docker images"
```

Create a GitHub Actions deployer service account that can push images:

```bash
gcloud iam service-accounts create "$DEPLOYER_SA_NAME" \
  --project "$GCP_PROJECT_ID" \
  --display-name "Humanly GitHub deployer"

gcloud artifacts repositories add-iam-policy-binding "$GCP_ARTIFACT_REPOSITORY" \
  --project "$GCP_PROJECT_ID" \
  --location "$GCP_REGION" \
  --member "serviceAccount:${DEPLOYER_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role "roles/artifactregistry.writer"
```

The VM also needs read access to pull images. If the VM already has an attached
service account, grant that account `roles/artifactregistry.reader`. Otherwise
create one:

```bash
gcloud iam service-accounts create "$VM_RUNTIME_SA_NAME" \
  --project "$GCP_PROJECT_ID" \
  --display-name "Humanly VM runtime"

gcloud artifacts repositories add-iam-policy-binding "$GCP_ARTIFACT_REPOSITORY" \
  --project "$GCP_PROJECT_ID" \
  --location "$GCP_REGION" \
  --member "serviceAccount:${VM_RUNTIME_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role "roles/artifactregistry.reader"
```

On the VM, configure Docker to authenticate to Artifact Registry:

```bash
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet
```

If the VM does not use an attached service account, activate a service account
key on the VM first, then run the same Docker auth command:

```bash
gcloud auth activate-service-account \
  --key-file /path/to/vm-artifact-registry-reader.json
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet
```

## GitHub Authentication Options

### Option 1: Service Account JSON Key

This is the easiest initial setup. Create a key for the deployer service
account:

```bash
gcloud iam service-accounts keys create humanly-github-deployer.json \
  --project "$GCP_PROJECT_ID" \
  --iam-account "${DEPLOYER_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
```

Store the full JSON file contents in the `GCP_SERVICE_ACCOUNT_KEY` GitHub
secret.

### Option 2: Workload Identity Federation

This avoids long-lived JSON keys and is the better long-term setup. Create a
pool, provider, and IAM binding:

```bash
export WIF_POOL_ID="github"
export WIF_PROVIDER_ID="humanly"
export GITHUB_ORG="OWNER"
export GITHUB_REPO="REPO"

gcloud iam workload-identity-pools create "$WIF_POOL_ID" \
  --project "$GCP_PROJECT_ID" \
  --location global \
  --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER_ID" \
  --project "$GCP_PROJECT_ID" \
  --location global \
  --workload-identity-pool "$WIF_POOL_ID" \
  --display-name "Humanly GitHub provider" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository == '${GITHUB_ORG}/${GITHUB_REPO}'"

export PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
export WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/providers/${WIF_PROVIDER_ID}"

gcloud iam service-accounts add-iam-policy-binding \
  "${DEPLOYER_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --project "$GCP_PROJECT_ID" \
  --role "roles/iam.workloadIdentityUser" \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}"
```

Store these GitHub secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: the value of `$WIF_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`: `${DEPLOYER_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com`

When both WIF secrets are present, the workflow uses WIF. Otherwise it falls
back to `GCP_SERVICE_ACCOUNT_KEY`.

## Required GitHub Secrets

Add these repository secrets:

- `GCP_PROJECT_ID`: GCP project ID.
- `GCP_REGION`: Artifact Registry region, for example `northamerica-northeast1`
  or `us-central1`.
- `GCP_ARTIFACT_REPOSITORY`: Artifact Registry repository name, usually
  `humanly`.
- `GCP_SERVICE_ACCOUNT_KEY`: service account JSON key contents, unless using
  Workload Identity Federation.
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: optional WIF provider resource name.
- `GCP_SERVICE_ACCOUNT_EMAIL`: optional WIF target service account email.
- `VM_HOST`: production VM host or IP.
- `VM_USER`: SSH username.
- `VM_SSH_KEY`: private SSH key for `VM_USER`.
- `VM_DEPLOY_PATH`: repository path on the VM, for example
  `/home/humanly/humanly`.
- `NEXT_PUBLIC_API_URL`: production API URL baked into the frontend-user build,
  for example `https://app.writehumanly.net/api/v1`.
- `NEXT_PUBLIC_WS_URL`: production WebSocket URL baked into the frontend-user
  build, for example `wss://app.writehumanly.net`.
- `ADMIN_NEXT_PUBLIC_API_URL`: optional admin frontend API origin. Defaults to
  `https://admin.writehumanly.net` when omitted.
- `ADMIN_NEXT_PUBLIC_WS_URL`: optional admin frontend WebSocket origin. Defaults
  to `wss://admin.writehumanly.net` when omitted.

The VM still uses its production `.env` file for backend runtime configuration,
including database, Redis, JWT, email, CORS, and other server-side values.

Required backend auth/email values on the VM:

- `FRONTEND_USER_URL`: `https://app.writehumanly.net`, used in password reset
  links and OAuth handoff redirects.
- `AUTH_COOKIE_DOMAIN`: optional explicit shared auth-cookie domain. Use
  `.writehumanly.net` if you need to override automatic derivation. When this
  is empty in production, the backend derives `.writehumanly.net` from
  `FRONTEND_USER_URL` and the admin frontend URL so `app.writehumanly.net` and
  `admin.writehumanly.net` can share login refresh cookies.
- `PUBLIC_API_URL`: `https://app.writehumanly.net/api/v1`, used as the OAuth
  callback base URL behind nginx.
- `EMAIL_SERVICE`: `sendgrid` or `smtp` in production. `console` is treated as
  non-operational in production so password reset cannot silently pretend to
  send email.
- `EMAIL_STRICT_DELIVERY`: optional. Set to `true` after provider secrets are
  installed if production should fail startup instead of running with email
  disabled.
- `EMAIL_FROM`: verified sender, for example `no-reply@writehumanly.net`.
- `EMAIL_API_KEY`: required for `EMAIL_SERVICE=sendgrid`.
- `EMAIL_HOST`, `EMAIL_USER`, and `EMAIL_PASSWORD`: required for
  `EMAIL_SERVICE=smtp`.
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`: optional; enables
  Google login when both are set.
- `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`: optional; enables
  GitHub login when both are set.

OAuth provider callback URLs:

```text
Google: https://app.writehumanly.net/api/v1/auth/oauth/google/callback
GitHub: https://app.writehumanly.net/api/v1/auth/oauth/github/callback
```

## Database Migrations

Production deploys run `scripts/run-migrations.sh` before restarting the
application services. The script:

- creates a `schema_migrations` table if it does not exist;
- records every applied SQL file by filename and checksum;
- applies only new files from `packages/backend/src/db/migrations/*.sql`;
- fails the deploy if an already-applied file has changed.

For the existing VM database, the first run detects that application tables
already exist but `schema_migrations` is empty. It baselines the current SQL
files without re-running old migrations, then exits. Future migration files are
applied automatically.

When writing migrations for existing production data:

- add new columns as nullable or with a real default;
- backfill old rows explicitly when the new field needs a value;
- add `NOT NULL` constraints only after old rows have been backfilled;
- do not edit a migration file after it has reached production; add a new file
  instead.

Manual migration status check:

```bash
cd /home/humanly/humanly

docker compose -f docker-compose.prod.yml exec -e PAGER=cat postgres \
  psql -U humanly_user -d humanly_prod \
  -c "SELECT filename, applied_at, baseline FROM schema_migrations ORDER BY filename;"
```

## Manual Deploy

To deploy a new set of images from the VM:

```bash
cd /home/humanly/humanly

export BACKEND_IMAGE="REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-backend:GIT_SHA"
export FRONTEND_USER_IMAGE="REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-frontend-user:GIT_SHA"
export FRONTEND_IMAGE="REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-frontend:GIT_SHA"

BACKEND_CHANGED=true FRONTEND_USER_CHANGED=true FRONTEND_CHANGED=true bash scripts/deploy.sh
```

The deploy script writes the image tags to `.env.production-images`. Running
`bash scripts/deploy.sh` later with no image variables reuses the stored tags
and refreshes nginx without restarting unchanged app services. To restart all
application services with the currently stored image tags:

```bash
cd /home/humanly/humanly
RESTART_ALL=1 bash scripts/deploy.sh
```

For a one-service manual deploy, pass only that service's image and changed
flag, for example:

```bash
cd /home/humanly/humanly
BACKEND_IMAGE="REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-backend:GIT_SHA" \
BACKEND_CHANGED=true \
bash scripts/deploy.sh
```

## Rollback

Rollback is a manual deploy of a previous commit-SHA tag:

```bash
cd /home/humanly/humanly

export BACKEND_IMAGE="REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-backend:PREVIOUS_GIT_SHA"
export FRONTEND_USER_IMAGE="REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-frontend-user:PREVIOUS_GIT_SHA"
export FRONTEND_IMAGE="REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-frontend:PREVIOUS_GIT_SHA"

BACKEND_CHANGED=true FRONTEND_USER_CHANGED=true FRONTEND_CHANGED=true bash scripts/deploy.sh
```

The deploy script prunes unused images after a successful release. Rollback
works only for image tags still present in Artifact Registry; if a previous tag
is not cached on the VM, Docker pulls it again during manual rollback.

## Production Compose Images

`docker-compose.prod.yml` now requires these variables for image selection:

```bash
BACKEND_IMAGE=REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-backend:GIT_SHA
FRONTEND_USER_IMAGE=REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-frontend-user:GIT_SHA
FRONTEND_IMAGE=REGION-docker.pkg.dev/PROJECT_ID/humanly/humanly-frontend:GIT_SHA
```

The deploy script exports those variables before running Docker Compose. Local
development remains unchanged and continues to use `docker-compose.yml` and
local build workflows.
