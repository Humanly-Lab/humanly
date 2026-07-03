#!/bin/bash
# Production deploy script.
# Runs on the GCP VM. Called by GitHub Actions on every push to main,
# or run manually with image variables set. Use RESTART_ALL=1 to restart
# every application service with the currently persisted image tags.
set -euo pipefail

REPO_DIR="${VM_DEPLOY_PATH:-${REPO_DIR:-/home/humanly/humanly}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
IMAGE_ENV_FILE="${IMAGE_ENV_FILE:-.env.production-images}"

bool_env() {
  case "${1:-false}" in
    true|TRUE|1|yes|YES) printf 'true' ;;
    *) printf 'false' ;;
  esac
}

disable_conflicting_host_certbot() {
  if [[ "${DISABLE_HOST_CERTBOT:-1}" != "1" ]]; then
    return 0
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    return 0
  fi

  if ! systemctl list-unit-files --type=service --type=timer 2>/dev/null | grep -Eq '^certbot\.(service|timer)'; then
    return 0
  fi

  echo "==> Disable host certbot units; Docker nginx owns ports 80/443"
  if [[ "$(id -u)" == "0" ]]; then
    systemctl disable --now certbot.timer certbot.service >/dev/null 2>&1 || true
    systemctl reset-failed certbot.service >/dev/null 2>&1 || true
  elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo systemctl disable --now certbot.timer certbot.service >/dev/null 2>&1 || true
    sudo systemctl reset-failed certbot.service >/dev/null 2>&1 || true
  else
    echo "WARN: host certbot units exist, but this user cannot run passwordless sudo to disable them." >&2
  fi
}

echo "==> [1/8] Enter deployment directory"
cd "$REPO_DIR"

INCOMING_BACKEND_IMAGE="${BACKEND_IMAGE:-}"
INCOMING_FRONTEND_USER_IMAGE="${FRONTEND_USER_IMAGE:-}"
INCOMING_FRONTEND_IMAGE="${FRONTEND_IMAGE:-}"
INCOMING_INFERENCE_IMAGE="${INFERENCE_IMAGE:-}"

BACKEND_CHANGED="$(bool_env "${BACKEND_CHANGED:-false}")"
FRONTEND_USER_CHANGED="$(bool_env "${FRONTEND_USER_CHANGED:-false}")"
FRONTEND_CHANGED="$(bool_env "${FRONTEND_CHANGED:-false}")"
INFERENCE_CHANGED="$(bool_env "${INFERENCE_CHANGED:-false}")"
RESTART_ALL="$(bool_env "${RESTART_ALL:-false}")"

echo "==> [2/8] Load and persist image tags"
if [[ -f "$IMAGE_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$IMAGE_ENV_FILE"
  set +a
elif [[ -z "$INCOMING_BACKEND_IMAGE" || -z "$INCOMING_FRONTEND_USER_IMAGE" || -z "$INCOMING_FRONTEND_IMAGE" || -z "$INCOMING_INFERENCE_IMAGE" ]]; then
  echo "ERROR: ${IMAGE_ENV_FILE} does not exist; all four image tags are required for the first deploy." >&2
  exit 1
fi

if [[ "$BACKEND_CHANGED" == "true" && "$RESTART_ALL" != "true" && -z "$INCOMING_BACKEND_IMAGE" ]]; then
  echo "ERROR: BACKEND_CHANGED=true but BACKEND_IMAGE was not provided." >&2
  exit 1
fi

if [[ "$FRONTEND_USER_CHANGED" == "true" && "$RESTART_ALL" != "true" && -z "$INCOMING_FRONTEND_USER_IMAGE" ]]; then
  echo "ERROR: FRONTEND_USER_CHANGED=true but FRONTEND_USER_IMAGE was not provided." >&2
  exit 1
fi

if [[ "$FRONTEND_CHANGED" == "true" && "$RESTART_ALL" != "true" && -z "$INCOMING_FRONTEND_IMAGE" ]]; then
  echo "ERROR: FRONTEND_CHANGED=true but FRONTEND_IMAGE was not provided." >&2
  exit 1
fi

if [[ "$INFERENCE_CHANGED" == "true" && "$RESTART_ALL" != "true" && -z "$INCOMING_INFERENCE_IMAGE" ]]; then
  echo "ERROR: INFERENCE_CHANGED=true but INFERENCE_IMAGE was not provided." >&2
  exit 1
fi

if [[ -n "$INCOMING_BACKEND_IMAGE" ]]; then
  BACKEND_IMAGE="$INCOMING_BACKEND_IMAGE"
  BACKEND_CHANGED=true
fi

if [[ -n "$INCOMING_FRONTEND_USER_IMAGE" ]]; then
  FRONTEND_USER_IMAGE="$INCOMING_FRONTEND_USER_IMAGE"
  FRONTEND_USER_CHANGED=true
fi

if [[ -n "$INCOMING_FRONTEND_IMAGE" ]]; then
  FRONTEND_IMAGE="$INCOMING_FRONTEND_IMAGE"
  FRONTEND_CHANGED=true
fi

if [[ -n "$INCOMING_INFERENCE_IMAGE" ]]; then
  INFERENCE_IMAGE="$INCOMING_INFERENCE_IMAGE"
  INFERENCE_CHANGED=true
fi

if [[ "$RESTART_ALL" == "true" ]]; then
  BACKEND_CHANGED=true
  FRONTEND_USER_CHANGED=true
  FRONTEND_CHANGED=true
  INFERENCE_CHANGED=true
fi

: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${FRONTEND_USER_IMAGE:?FRONTEND_USER_IMAGE is required}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"
: "${INFERENCE_IMAGE:?INFERENCE_IMAGE is required}"

umask 077
{
  printf 'BACKEND_IMAGE=%s\n' "$BACKEND_IMAGE"
  printf 'FRONTEND_USER_IMAGE=%s\n' "$FRONTEND_USER_IMAGE"
  printf 'FRONTEND_IMAGE=%s\n' "$FRONTEND_IMAGE"
  printf 'INFERENCE_IMAGE=%s\n' "$INFERENCE_IMAGE"
} > "$IMAGE_ENV_FILE"

echo "    backend: ${BACKEND_IMAGE} (changed=${BACKEND_CHANGED})"
echo "    frontend-user: ${FRONTEND_USER_IMAGE} (changed=${FRONTEND_USER_CHANGED})"
echo "    frontend: ${FRONTEND_IMAGE} (changed=${FRONTEND_CHANGED})"
echo "    inference: ${INFERENCE_IMAGE} (changed=${INFERENCE_CHANGED})"

echo "==> [3/8] Ensure uploads directory exists"
mkdir -p uploads

echo "==> [4/8] Validate compose configuration"
docker compose -f "$COMPOSE_FILE" config --quiet

changed_services=()
if [[ "$BACKEND_CHANGED" == "true" ]]; then
  changed_services+=(backend)
fi
if [[ "$FRONTEND_USER_CHANGED" == "true" ]]; then
  changed_services+=(frontend-user)
fi
if [[ "$FRONTEND_CHANGED" == "true" ]]; then
  changed_services+=(frontend)
fi

echo "==> [5/8] Pull changed prebuilt application images"
if [[ "$INFERENCE_CHANGED" == "true" ]]; then
  docker compose -f "$COMPOSE_FILE" pull inference
fi
if [[ "${#changed_services[@]}" -gt 0 ]]; then
  docker compose -f "$COMPOSE_FILE" pull "${changed_services[@]}"
else
  echo "    No application image changes; preserving existing image tags."
fi

echo "==> [6/8] Ensure stateful + inference services are running"
# inference is a backend dependency (detector inference) and stays resident like postgres/redis;
# placed here so it is ready before migrations/backend restart, and gets rebuilt when its image changes.
docker compose -f "$COMPOSE_FILE" up -d --wait postgres redis inference

echo "==> [7/8] Run pending database migrations"
if [[ "$BACKEND_CHANGED" == "true" || "${RUN_MIGRATIONS:-0}" == "1" ]]; then
  COMPOSE_FILE="$COMPOSE_FILE" bash scripts/run-migrations.sh
else
  echo "    Backend unchanged; skipping migration check."
fi

echo "==> [8/8] Restart application services"
if [[ "${#changed_services[@]}" -gt 0 ]]; then
  docker compose -f "$COMPOSE_FILE" up -d --no-deps --wait "${changed_services[@]}"
else
  echo "    No application services to restart."
fi
docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate nginx

echo "==> Ensure production TLS certificate covers supported hostnames"
disable_conflicting_host_certbot
bash scripts/ensure-production-cert.sh
docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate nginx

echo "==> Current service status"
docker compose -f "$COMPOSE_FILE" ps

echo "==> Clean up unused Docker resources"
docker image prune -af
docker container prune -f

echo "==> Deploy complete"
