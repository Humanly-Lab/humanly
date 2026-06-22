#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR="24"

log() {
  printf '\n[create-humanly] %s\n' "$*"
}

fail() {
  printf '\n[create-humanly] %s\n' "$*" >&2
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

node_ok() {
  have node || return 1
  have npm || return 1
  local major
  major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  [ "${major}" -ge 20 ]
}

install_node() {
  if node_ok; then
    log "Node and npm are ready: $(node --version), npm $(npm --version)"
    return
  fi

  log "Installing Node.js ${NODE_MAJOR}.x and npm."

  if have volta; then
    volta install "node@${NODE_MAJOR}"
    return
  fi

  case "$(uname -s)" in
    Darwin)
      have brew || fail "Homebrew is required to install Node automatically on macOS. Install Node.js 20+ from https://nodejs.org/ or install Homebrew, then rerun this script."
      brew install node
      ;;
    Linux)
      have curl || fail "curl is required to install Node automatically."
      if have apt-get; then
        if is_root; then
          curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
          apt-get install -y nodejs
        else
          curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
          sudo apt-get install -y nodejs
        fi
      elif have dnf; then
        if is_root; then
          curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
          dnf install -y nodejs
        else
          curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | sudo bash -
          sudo dnf install -y nodejs
        fi
      elif have yum; then
        if is_root; then
          curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
          yum install -y nodejs
        else
          curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | sudo bash -
          sudo yum install -y nodejs
        fi
      else
        fail "Unsupported Linux package manager. Install Node.js 20+ manually, then rerun this script."
      fi
      ;;
    *)
      fail "Unsupported OS for automatic Node install. Install Node.js 20+ manually, then rerun this script."
      ;;
  esac

  node_ok || fail "Node.js installation did not produce a usable node/npm command."
}

docker_cli_ok() {
  have docker
}

docker_compose_ok() {
  docker compose version >/dev/null 2>&1
}

docker_daemon_ok() {
  docker info >/dev/null 2>&1
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
  local waited=0
  while [ "${waited}" -lt 60 ]; do
    if docker_daemon_ok; then
      return 0
    fi
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

install_docker() {
  if docker_cli_ok && docker_compose_ok; then
    log "Docker CLI and Compose are ready."
  else
    log "Installing Docker and Docker Compose."

    case "$(uname -s)" in
      Darwin)
        have brew || fail "Homebrew is required to install Docker Desktop automatically on macOS. Install Docker Desktop from https://www.docker.com/products/docker-desktop/, then rerun this script."
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
          fail "Unsupported Linux package manager. Install Docker Engine and Docker Compose v2 manually, then rerun this script."
        fi
        ;;
      *)
        fail "Unsupported OS for automatic Docker install. Install Docker Desktop or Docker Engine manually, then rerun this script."
        ;;
    esac
  fi

  docker_cli_ok || fail "Docker command is still unavailable after installation."
  docker_compose_ok || fail "Docker Compose v2 is still unavailable after installation."

  if ! docker_daemon_ok; then
    log "Starting Docker."
    try_start_docker
    wait_for_docker || fail "Docker is installed, but the daemon is not running yet. Start Docker Desktop or the docker service, then run npx create-humanly@latest."
  fi

  log "Docker is ready."
}

install_node
install_docker

log "Prerequisites are ready. Next run:"
printf '  npx create-humanly@latest\n'
