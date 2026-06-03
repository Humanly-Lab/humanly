#!/usr/bin/env bash
# Repair operator SSH access on the production GCE VM by installing one public
# key through a one-shot startup script. This is a break-glass tool for the case
# where metadata keys are present but the guest OS has not materialized them.
set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:-hai-gcp-representation}"
GCP_ZONE="${GCP_ZONE:-us-central1-f}"
GCP_INSTANCE="${GCP_INSTANCE:-humanly-project}"
OPERATOR_USER="${OPERATOR_USER:-zhu}"
OPERATOR_PUBLIC_KEY_FILE="${OPERATOR_PUBLIC_KEY_FILE:-$HOME/.ssh/google_compute_engine.pub}"
OPERATOR_PRIVATE_KEY_FILE="${OPERATOR_PRIVATE_KEY_FILE:-${OPERATOR_PUBLIC_KEY_FILE%.pub}}"

if [[ ! -f "$OPERATOR_PUBLIC_KEY_FILE" ]]; then
  echo "ERROR: public key file not found: $OPERATOR_PUBLIC_KEY_FILE" >&2
  exit 1
fi

if [[ ! -f "$OPERATOR_PRIVATE_KEY_FILE" ]]; then
  echo "ERROR: private key file not found: $OPERATOR_PRIVATE_KEY_FILE" >&2
  exit 1
fi

public_key_b64="$(base64 < "$OPERATOR_PUBLIC_KEY_FILE" | tr -d '\n')"
startup_script="$(mktemp)"

cleanup() {
  rm -f "$startup_script"
}
trap cleanup EXIT

cat > "$startup_script" <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail

operator_user="$OPERATOR_USER"
public_key="\$(printf '%s' '$public_key_b64' | base64 -d)"

if ! id -u "\$operator_user" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "\$operator_user"
fi

install -d -m 700 -o "\$operator_user" -g "\$operator_user" "/home/\$operator_user/.ssh"
authorized_keys="/home/\$operator_user/.ssh/authorized_keys"
touch "\$authorized_keys"
if ! grep -qxF "\$public_key" "\$authorized_keys"; then
  printf '%s\n' "\$public_key" >> "\$authorized_keys"
fi
chown "\$operator_user:\$operator_user" "\$authorized_keys"
chmod 600 "\$authorized_keys"

usermod -aG sudo "\$operator_user" || true
usermod -aG docker "\$operator_user" || true
printf '%s\n' "\$operator_user ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-humanly-operator-\$operator_user"
chmod 440 "/etc/sudoers.d/90-humanly-operator-\$operator_user"

# Docker Compose nginx is the production 80/443 owner. Host certbot must not
# try to start host nginx during renewal.
systemctl disable --now certbot.timer certbot.service >/dev/null 2>&1 || true
systemctl reset-failed certbot.service >/dev/null 2>&1 || true
systemctl restart google-guest-agent >/dev/null 2>&1 || true

mkdir -p /var/lib/humanly
date -Is > /var/lib/humanly/ssh-repair-last-run
SCRIPT

echo "==> Installing one-shot startup script on ${GCP_INSTANCE}"
gcloud compute instances add-metadata "$GCP_INSTANCE" \
  --project "$GCP_PROJECT_ID" \
  --zone "$GCP_ZONE" \
  --metadata-from-file startup-script="$startup_script"

echo "==> Resetting ${GCP_INSTANCE} so the startup script runs"
gcloud compute instances reset "$GCP_INSTANCE" \
  --project "$GCP_PROJECT_ID" \
  --zone "$GCP_ZONE" \
  --quiet

echo "==> Waiting for ${GCP_INSTANCE} to return to RUNNING"
for _ in {1..60}; do
  status="$(gcloud compute instances describe "$GCP_INSTANCE" \
    --project "$GCP_PROJECT_ID" \
    --zone "$GCP_ZONE" \
    --format='get(status)')"
  if [[ "$status" == "RUNNING" ]]; then
    break
  fi
  sleep 5
done

external_ip="$(gcloud compute instances describe "$GCP_INSTANCE" \
  --project "$GCP_PROJECT_ID" \
  --zone "$GCP_ZONE" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

echo "==> Waiting for SSH as ${OPERATOR_USER}@${external_ip}"
for attempt in {1..60}; do
  if ssh -i "$OPERATOR_PRIVATE_KEY_FILE" \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o ConnectTimeout=10 \
    -o BatchMode=yes \
    "${OPERATOR_USER}@${external_ip}" 'whoami && hostname' >/tmp/humanly-ssh-repair-check 2>&1; then
    cat /tmp/humanly-ssh-repair-check
    break
  fi

  if (( attempt == 60 )); then
    cat /tmp/humanly-ssh-repair-check >&2 || true
    echo "ERROR: SSH did not become available for ${OPERATOR_USER}." >&2
    exit 1
  fi
  sleep 5
done

rm -f /tmp/humanly-ssh-repair-check

echo "==> Removing one-shot startup script metadata"
gcloud compute instances remove-metadata "$GCP_INSTANCE" \
  --project "$GCP_PROJECT_ID" \
  --zone "$GCP_ZONE" \
  --keys startup-script \
  --quiet

echo "==> SSH repair complete"
