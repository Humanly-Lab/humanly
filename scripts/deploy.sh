#!/bin/bash
# Production deploy script.
# Runs on the GCP VM. Called by GitHub Actions on every push to main,
# or run manually with BACKEND_IMAGE, FRONTEND_USER_IMAGE, and FRONTEND_IMAGE set.
set -euo pipefail

REPO_DIR="${VM_DEPLOY_PATH:-${REPO_DIR:-/home/humanly/humanly}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
IMAGE_ENV_FILE="${IMAGE_ENV_FILE:-.env.production-images}"

echo "==> [1/8] Enter deployment directory"
cd "$REPO_DIR"

if [[ -n "${BACKEND_IMAGE:-}" || -n "${FRONTEND_USER_IMAGE:-}" || -n "${FRONTEND_IMAGE:-}" ]]; then
  : "${BACKEND_IMAGE:?BACKEND_IMAGE is required when updating image tags}"
  : "${FRONTEND_USER_IMAGE:?FRONTEND_USER_IMAGE is required when updating image tags}"
  : "${FRONTEND_IMAGE:?FRONTEND_IMAGE is required when updating image tags}"

  echo "==> [2/8] Persist image tags to ${IMAGE_ENV_FILE}"
  umask 077
  {
    printf 'BACKEND_IMAGE=%s\n' "$BACKEND_IMAGE"
    printf 'FRONTEND_USER_IMAGE=%s\n' "$FRONTEND_USER_IMAGE"
    printf 'FRONTEND_IMAGE=%s\n' "$FRONTEND_IMAGE"
  } > "$IMAGE_ENV_FILE"
else
  echo "==> [2/8] Load existing image tags from ${IMAGE_ENV_FILE}"
  if [[ ! -f "$IMAGE_ENV_FILE" ]]; then
    echo "ERROR: BACKEND_IMAGE, FRONTEND_USER_IMAGE, and FRONTEND_IMAGE were not provided, and ${IMAGE_ENV_FILE} does not exist." >&2
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1090
source "$IMAGE_ENV_FILE"
set +a

: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${FRONTEND_USER_IMAGE:?FRONTEND_USER_IMAGE is required}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"

echo "    backend: ${BACKEND_IMAGE}"
echo "    frontend-user: ${FRONTEND_USER_IMAGE}"
echo "    frontend: ${FRONTEND_IMAGE}"

echo "==> [3/8] Ensure uploads directory exists"
mkdir -p uploads

echo "==> [4/8] Validate compose configuration"
docker compose -f "$COMPOSE_FILE" config --quiet

echo "==> [5/8] Pull prebuilt application images"
docker compose -f "$COMPOSE_FILE" pull backend frontend-user frontend

echo "==> [6/8] Ensure stateful services are running"
docker compose -f "$COMPOSE_FILE" up -d --wait postgres redis

echo "==> [7/8] Run pending database migrations"
COMPOSE_FILE="$COMPOSE_FILE" bash scripts/run-migrations.sh

echo "==> [8/8] Restart application services"
docker compose -f "$COMPOSE_FILE" up -d --no-deps --wait backend frontend-user frontend
docker compose -f "$COMPOSE_FILE" up -d --no-deps nginx

echo "==> Current service status"
docker compose -f "$COMPOSE_FILE" ps

echo "==> Clean up dangling images"
docker image prune -f --filter "dangling=true"

echo "==> Deploy complete"
