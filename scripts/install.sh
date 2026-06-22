#!/usr/bin/env sh
set -eu

SCRIPT_NAME="humanly"
DEFAULT_REPO="ShenzheZhu/humanly"
DEFAULT_SOURCE_REF="main"
DEFAULT_TARGET_DIR="humanly"
DEFAULT_ADMIN_EMAIL="admin@mail.com"
DEFAULT_ADMIN_PASSWORD="admin123456"

COMMAND="install"
TARGET_DIR="${HUMANLY_DIR:-$DEFAULT_TARGET_DIR}"
REPO="${HUMANLY_REPO:-$DEFAULT_REPO}"
SOURCE_REF="${HUMANLY_SOURCE_REF:-$DEFAULT_SOURCE_REF}"
SOURCE_URL="${HUMANLY_SOURCE_URL:-}"
SOURCE_DIR="${HUMANLY_SOURCE_DIR:-}"
NO_START=0
SKIP_DOCKER_CHECK=0
FORCE=0
ASSUME_YES=0
ADMIN_EMAIL="${HUMANLY_ADMIN_EMAIL:-$DEFAULT_ADMIN_EMAIL}"
ADMIN_PASSWORD="${HUMANLY_ADMIN_PASSWORD:-$DEFAULT_ADMIN_PASSWORD}"
PUBLISHER_URL="${HUMANLY_PUBLISHER_URL:-http://localhost:3000}"
WRITER_URL="${HUMANLY_WRITER_URL:-http://localhost:3002}"
API_URL="${HUMANLY_API_URL:-http://localhost:3001}"

log() {
  printf '\n[%s] %s\n' "$SCRIPT_NAME" "$*"
}

fail() {
  printf '\n[%s] %s\n' "$SCRIPT_NAME" "$*" >&2
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

is_root() {
  [ "$(id -u)" -eq 0 ]
}

sudo_cmd() {
  if is_root; then
    "$@"
  else
    sudo "$@"
  fi
}

usage() {
  cat <<'EOF'
Humanly self-host installer

Usage:
  curl -fsSL https://raw.githubusercontent.com/ShenzheZhu/humanly/main/scripts/install.sh | sh
  curl -fsSL https://raw.githubusercontent.com/ShenzheZhu/humanly/main/scripts/install.sh | sh -s -- [command] [options]
  ./humanly [command] [options]

Commands:
  install      Download Humanly, generate local config, and start the stack
  start        Start the installed stack
  stop         Stop the installed stack
  restart      Restart the installed stack
  status       Show Docker Compose status
  upgrade      Download the selected ref again and rebuild the stack
  uninstall    Stop the stack, remove Docker volumes, and delete the install dir

Options:
  --dir <path>              Install directory (default: humanly)
  --source-ref <ref>        GitHub branch or tag to download (default: main)
  --source-url <url>        Full tar.gz source URL
  --source-dir <path>       Copy source from a local directory
  --repo <owner/repo>       GitHub repository (default: ShenzheZhu/humanly)
  --no-start                Generate files without starting Docker
  --skip-docker-check       Skip Docker checks for scaffold-only automation
  --force                   Allow writing into an existing directory
  --yes, -y                 Confirm destructive actions such as uninstall
  --admin-email <email>     Default local Publisher Portal admin email
  --admin-password <pass>   Default local Publisher Portal admin password
  --publisher-url <url>     Publisher Portal URL (default: http://localhost:3000)
  --writer-url <url>        Writer Portal URL (default: http://localhost:3002)
  --api-url <url>           Backend URL (default: http://localhost:3001)
  --help, -h                Show this help

Local quickstart uses console email and local Docker storage. No Node.js, npm,
SMTP, SendGrid, Resend, S3, or other third-party service is required.
EOF
}

trim_trailing_slash() {
  printf '%s' "$1" | sed 's:/*$::'
}

sed_replacement_escape() {
  printf '%s' "$1" | sed 's/[&|\\]/\\&/g'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    install|start|stop|restart|status|upgrade|uninstall)
      COMMAND="$1"
      ;;
    --dir)
      shift
      [ "$#" -gt 0 ] || fail "--dir requires a value"
      TARGET_DIR="$1"
      ;;
    --source-ref)
      shift
      [ "$#" -gt 0 ] || fail "--source-ref requires a value"
      SOURCE_REF="$1"
      ;;
    --source-url)
      shift
      [ "$#" -gt 0 ] || fail "--source-url requires a value"
      SOURCE_URL="$1"
      ;;
    --source-dir)
      shift
      [ "$#" -gt 0 ] || fail "--source-dir requires a value"
      SOURCE_DIR="$1"
      ;;
    --repo)
      shift
      [ "$#" -gt 0 ] || fail "--repo requires a value"
      REPO="$1"
      ;;
    --no-start)
      NO_START=1
      ;;
    --skip-docker-check)
      SKIP_DOCKER_CHECK=1
      ;;
    --force)
      FORCE=1
      ;;
    --yes|-y)
      ASSUME_YES=1
      ;;
    --admin-email)
      shift
      [ "$#" -gt 0 ] || fail "--admin-email requires a value"
      ADMIN_EMAIL="$1"
      ;;
    --admin-password)
      shift
      [ "$#" -gt 0 ] || fail "--admin-password requires a value"
      ADMIN_PASSWORD="$1"
      ;;
    --publisher-url)
      shift
      [ "$#" -gt 0 ] || fail "--publisher-url requires a value"
      PUBLISHER_URL="$(trim_trailing_slash "$1")"
      ;;
    --writer-url)
      shift
      [ "$#" -gt 0 ] || fail "--writer-url requires a value"
      WRITER_URL="$(trim_trailing_slash "$1")"
      ;;
    --api-url)
      shift
      [ "$#" -gt 0 ] || fail "--api-url requires a value"
      API_URL="$(trim_trailing_slash "$1")"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      fail "Unknown option: $1"
      ;;
    *)
      TARGET_DIR="$1"
      ;;
  esac
  shift
done

absolute_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "$PWD/$1" ;;
  esac
}

TARGET_DIR="$(absolute_path "$TARGET_DIR")"

random_hex() {
  bytes="$1"
  if have openssl; then
    openssl rand -hex "$bytes"
  elif have python3; then
    python3 -c "import secrets; print(secrets.token_hex($bytes))"
  else
    od -An -N "$bytes" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

build_source_url() {
  if [ -n "$SOURCE_URL" ]; then
    printf '%s\n' "$SOURCE_URL"
    return
  fi

  case "$SOURCE_REF" in
    refs/*) ref_path="$SOURCE_REF" ;;
    v*) ref_path="refs/tags/$SOURCE_REF" ;;
    *) ref_path="refs/heads/$SOURCE_REF" ;;
  esac

  printf 'https://codeload.github.com/%s/tar.gz/%s\n' "$REPO" "$ref_path"
}

copy_source_dir() {
  src="$1"
  dest="$2"
  mkdir -p "$dest"
  (
    cd "$src"
    tar \
      --exclude='.git' \
      --exclude='.next' \
      --exclude='.turbo' \
      --exclude='.vercel' \
      --exclude='node_modules' \
      --exclude='dist' \
      --exclude='coverage' \
      -cf - .
  ) | (
    cd "$dest"
    tar -xf -
  )
}

sync_source_dir() {
  src="$1"
  dest="$2"
  mkdir -p "$dest"
  if have rsync; then
    rsync -a --delete \
      --exclude='.git' \
      --exclude='.next' \
      --exclude='.turbo' \
      --exclude='.vercel' \
      --exclude='node_modules' \
      --exclude='dist' \
      --exclude='coverage' \
      --exclude='docker-compose.yml' \
      --exclude='.env.quickstart' \
      --exclude='HUMANLY_LOCAL_QUICKSTART.md' \
      --exclude='humanly' \
      "$src"/ "$dest"/
  else
    copy_source_dir "$src" "$dest"
  fi
}

download_source_to() {
  dest="$1"
  url="$(build_source_url)"
  tmp_dir="$(mktemp -d)"
  archive="$tmp_dir/humanly.tar.gz"
  extract_dir="$tmp_dir/extract"

  log "Downloading Humanly source from $url"
  mkdir -p "$extract_dir"
  curl -fsSL "$url" -o "$archive"
  tar -xzf "$archive" -C "$extract_dir"
  source_root="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -n "$source_root" ] || fail "Downloaded archive did not contain a source directory."
  sync_source_dir "$source_root" "$dest"
  rm -rf "$tmp_dir"
}

load_source_to() {
  dest="$1"
  if [ -n "$SOURCE_DIR" ]; then
    SOURCE_DIR="$(absolute_path "$SOURCE_DIR")"
    [ -d "$SOURCE_DIR" ] || fail "Source directory does not exist: $SOURCE_DIR"
    log "Copying Humanly source from $SOURCE_DIR"
    sync_source_dir "$SOURCE_DIR" "$dest"
  else
    download_source_to "$dest"
  fi
}

env_value() {
  key="$1"
  file="$2"
  [ -f "$file" ] || return 0
  sed -n "s/^$key=//p" "$file" | tail -n 1
}

ensure_secrets() {
  env_file="$TARGET_DIR/.env.quickstart"

  POSTGRES_PASSWORD="$(env_value POSTGRES_PASSWORD "$env_file")"
  JWT_SECRET="$(env_value JWT_SECRET "$env_file")"
  AI_ENCRYPTION_KEY="$(env_value AI_ENCRYPTION_KEY "$env_file")"
  existing_publisher="$(env_value PUBLISHER_PORTAL_URL "$env_file")"
  existing_writer="$(env_value WRITER_PORTAL_URL "$env_file")"
  existing_api="$(env_value BACKEND_API_URL "$env_file")"
  existing_admin_email="$(env_value QUICKSTART_ADMIN_EMAIL "$env_file")"
  existing_admin_password="$(env_value QUICKSTART_ADMIN_PASSWORD "$env_file")"

  [ -n "$POSTGRES_PASSWORD" ] || POSTGRES_PASSWORD="$(random_hex 18)"
  [ -n "$JWT_SECRET" ] || JWT_SECRET="$(random_hex 32)"
  [ -n "$AI_ENCRYPTION_KEY" ] || AI_ENCRYPTION_KEY="$(random_hex 32)"
  [ -n "$existing_publisher" ] || existing_publisher="$PUBLISHER_URL"
  [ -n "$existing_writer" ] || existing_writer="$WRITER_URL"
  [ -n "$existing_api" ] || existing_api="$API_URL"
  [ -n "$existing_admin_email" ] || existing_admin_email="$ADMIN_EMAIL"
  [ -n "$existing_admin_password" ] || existing_admin_password="$ADMIN_PASSWORD"

  PUBLISHER_URL="$existing_publisher"
  WRITER_URL="$existing_writer"
  API_URL="$existing_api"
  ADMIN_EMAIL="$existing_admin_email"
  ADMIN_PASSWORD="$existing_admin_password"
}

render_compose() {
  quickstart="$TARGET_DIR/docker-compose.quickstart.yml"
  [ -f "$quickstart" ] || fail "Missing docker-compose.quickstart.yml in $TARGET_DIR"

  publisher_127="$(printf '%s' "$PUBLISHER_URL" | sed 's/localhost/127.0.0.1/g')"
  writer_127="$(printf '%s' "$WRITER_URL" | sed 's/localhost/127.0.0.1/g')"
  cors_origin="$PUBLISHER_URL,$WRITER_URL,$publisher_127,$writer_127"
  public_api_url="$API_URL/api/v1"

  escaped_postgres_password="$(sed_replacement_escape "$POSTGRES_PASSWORD")"
  escaped_jwt_secret="$(sed_replacement_escape "$JWT_SECRET")"
  escaped_ai_encryption_key="$(sed_replacement_escape "$AI_ENCRYPTION_KEY")"
  escaped_cors_origin="$(sed_replacement_escape "$cors_origin")"
  escaped_publisher_url="$(sed_replacement_escape "$PUBLISHER_URL")"
  escaped_writer_url="$(sed_replacement_escape "$WRITER_URL")"
  escaped_api_url="$(sed_replacement_escape "$API_URL")"
  escaped_public_api_url="$(sed_replacement_escape "$public_api_url")"
  escaped_admin_email="$(sed_replacement_escape "$ADMIN_EMAIL")"
  escaped_admin_password="$(sed_replacement_escape "$ADMIN_PASSWORD")"

  sed \
    -e "s|humanly_password|$escaped_postgres_password|g" \
    -e "s|humanly_quickstart_local_jwt_secret_change_before_production|$escaped_jwt_secret|g" \
    -e "s|0000000000000000000000000000000000000000000000000000000000000000|$escaped_ai_encryption_key|g" \
    -e "s|http://localhost:3000,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3002|$escaped_cors_origin|g" \
    -e "s|http://localhost:3000|$escaped_publisher_url|g" \
    -e "s|http://localhost:3002|$escaped_writer_url|g" \
    -e "s|http://localhost:3001/api/v1|$escaped_public_api_url|g" \
    -e "s|http://localhost:3001|$escaped_api_url|g" \
    -e "s|admin@mail.com|$escaped_admin_email|g" \
    -e "s|admin123456|$escaped_admin_password|g" \
    "$quickstart" > "$TARGET_DIR/docker-compose.yml"
}

render_env() {
  cat > "$TARGET_DIR/.env.quickstart" <<EOF
# Generated by Humanly self-host installer. Keep this file local.
HUMANLY_INSTALL_MODE=quickstart
HUMANLY_SOURCE_REF=$SOURCE_REF
HUMANLY_REPO=$REPO
PUBLISHER_PORTAL_URL=$PUBLISHER_URL
WRITER_PORTAL_URL=$WRITER_URL
BACKEND_API_URL=$API_URL
QUICKSTART_ADMIN_EMAIL=$ADMIN_EMAIL
QUICKSTART_ADMIN_PASSWORD=$ADMIN_PASSWORD
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
AI_ENCRYPTION_KEY=$AI_ENCRYPTION_KEY
EMAIL_SERVICE=console
FILE_STORAGE_PROVIDER=local
EOF
}

render_local_readme() {
  cat > "$TARGET_DIR/HUMANLY_LOCAL_QUICKSTART.md" <<EOF
# Humanly Local Quickstart

This directory was generated by the Humanly self-host installer.

## Manage

\`\`\`bash
./humanly start
./humanly stop
./humanly restart
./humanly status
./humanly upgrade
./humanly uninstall
\`\`\`

## Open

- Publisher Portal: $PUBLISHER_URL
- Writer Portal: $WRITER_URL
- Backend API: $API_URL

## Default local admin

- Email: \`$ADMIN_EMAIL\`
- Password: \`$ADMIN_PASSWORD\`

Email is local-only in this quickstart. Humanly prints account and notification
emails to backend logs with \`EMAIL_SERVICE=console\`; no third-party email
provider is required.
EOF
}

install_wrapper() {
  cat > "$TARGET_DIR/humanly" <<'EOF'
#!/usr/bin/env sh
set -eu
HUMANLY_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec sh "$HUMANLY_DIR/scripts/install.sh" --dir "$HUMANLY_DIR" "$@"
EOF
  chmod +x "$TARGET_DIR/humanly"
}

docker_cli_ok() {
  docker --version >/dev/null 2>&1 || { have sudo && sudo -n docker --version >/dev/null 2>&1; }
}

docker_compose_ok() {
  docker compose version >/dev/null 2>&1 || { have sudo && sudo -n docker compose version >/dev/null 2>&1; }
}

docker_daemon_ok() {
  docker info >/dev/null 2>&1 || { have sudo && sudo -n docker info >/dev/null 2>&1; }
}

docker_compose() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
  else
    sudo docker compose "$@"
  fi
}

try_start_docker() {
  case "$(uname -s)" in
    Darwin)
      if have open; then
        open -a Docker >/dev/null 2>&1 || true
      fi
      ;;
    Linux)
      if have systemctl; then
        sudo_cmd systemctl enable --now docker >/dev/null 2>&1 || true
      fi
      ;;
  esac
}

wait_for_docker() {
  waited=0
  while [ "$waited" -lt 60 ]; do
    if docker_daemon_ok; then
      return 0
    fi
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

install_docker() {
  log "Installing Docker and Docker Compose."
  case "$(uname -s)" in
    Darwin)
      have brew || fail "Homebrew is required to install Docker Desktop automatically on macOS. Install Docker Desktop manually, then rerun this installer."
      brew install --cask docker
      ;;
    Linux)
      if have apt-get; then
        sudo_cmd apt-get update
        sudo_cmd apt-get install -y docker.io docker-compose-plugin
      elif have dnf; then
        sudo_cmd dnf install -y docker docker-compose-plugin
      elif have yum; then
        sudo_cmd yum install -y docker docker-compose-plugin
      else
        fail "Unsupported Linux package manager. Install Docker Engine and Docker Compose v2 manually, then rerun this installer."
      fi
      ;;
    *)
      fail "Unsupported OS for automatic Docker install. Install Docker manually, then rerun this installer."
      ;;
  esac
}

ensure_docker_ready() {
  if [ "$NO_START" -eq 1 ] || [ "$SKIP_DOCKER_CHECK" -eq 1 ]; then
    return
  fi

  if ! docker_cli_ok || ! docker_compose_ok; then
    install_docker
  fi

  docker_cli_ok || fail "Docker command is still unavailable after installation."
  docker_compose_ok || fail "Docker Compose v2 is still unavailable after installation."

  if ! docker_daemon_ok; then
    log "Starting Docker."
    try_start_docker
    wait_for_docker || fail "Docker is installed, but the daemon is not running or this user cannot access it. Start Docker Desktop or the docker service, then rerun this installer."
  fi
}

assert_target_writable() {
  if [ -d "$TARGET_DIR" ] && [ "$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')" != "0" ] && [ "$FORCE" -ne 1 ]; then
    fail "Target directory is not empty: $TARGET_DIR. Use --force or choose a new directory."
  fi
}

start_stack() {
  ensure_installed
  ensure_docker_ready
  log "Starting Humanly with Docker Compose. Initial build can take several minutes."
  (cd "$TARGET_DIR" && docker_compose -f docker-compose.yml up --build -d)
}

stop_stack() {
  ensure_installed
  ensure_docker_ready
  (cd "$TARGET_DIR" && docker_compose -f docker-compose.yml down)
}

status_stack() {
  ensure_installed
  ensure_docker_ready
  (cd "$TARGET_DIR" && docker_compose -f docker-compose.yml ps)
}

ensure_installed() {
  [ -f "$TARGET_DIR/docker-compose.yml" ] || fail "Humanly is not installed at $TARGET_DIR"
}

print_done() {
  if [ "$NO_START" -eq 1 ]; then
    status_text="Humanly files are ready. Start later with ./humanly start."
  else
    status_text="Humanly is starting. Use ./humanly status or docker compose logs -f to watch startup."
  fi

  cat <<EOF

$status_text

Directory:        $TARGET_DIR
Publisher Portal: $PUBLISHER_URL
Writer Portal:    $WRITER_URL
Backend API:      $API_URL

Default local admin:
  email:    $ADMIN_EMAIL
  password: $ADMIN_PASSWORD

Local email is handled with EMAIL_SERVICE=console. No third-party email service is required.

Manage this install:
  cd "$TARGET_DIR"
  ./humanly start
  ./humanly stop
  ./humanly upgrade
  ./humanly uninstall

EOF
}

install_humanly() {
  ensure_docker_ready
  assert_target_writable
  mkdir -p "$TARGET_DIR"
  load_source_to "$TARGET_DIR"
  ensure_secrets
  render_compose
  render_env
  render_local_readme
  install_wrapper

  if [ "$NO_START" -eq 0 ]; then
    start_stack
  fi

  print_done
}

upgrade_humanly() {
  ensure_installed
  ensure_docker_ready
  load_source_to "$TARGET_DIR"
  ensure_secrets
  render_compose
  render_env
  render_local_readme
  install_wrapper
  start_stack
  print_done
}

uninstall_humanly() {
  ensure_installed
  if [ "$ASSUME_YES" -ne 1 ]; then
    printf 'This will stop Humanly, remove Docker volumes, and delete %s. Continue? [y/N] ' "$TARGET_DIR"
    if ! read answer; then
      answer=""
    fi
    case "$answer" in
      y|Y|yes|YES) ;;
      *) fail "Uninstall cancelled." ;;
    esac
  fi

  ensure_docker_ready
  (cd "$TARGET_DIR" && docker_compose -f docker-compose.yml down -v)
  rm -rf "$TARGET_DIR"
  log "Humanly was uninstalled from $TARGET_DIR"
}

case "$COMMAND" in
  install)
    install_humanly
    ;;
  start)
    NO_START=0
    start_stack
    ;;
  stop)
    stop_stack
    ;;
  restart)
    stop_stack
    start_stack
    ;;
  status)
    status_stack
    ;;
  upgrade)
    upgrade_humanly
    ;;
  uninstall)
    uninstall_humanly
    ;;
  *)
    fail "Unknown command: $COMMAND"
    ;;
esac
