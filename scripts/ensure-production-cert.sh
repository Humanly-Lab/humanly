#!/bin/bash
# Ensure the production nginx certificate covers every supported public host.
# Runs on the production VM after nginx is up so certbot can use webroot ACME.
set -euo pipefail

REPO_DIR="${VM_DEPLOY_PATH:-${REPO_DIR:-/home/humanly/humanly}}"
CERT_DIR="${CERT_DIR:-nginx/ssl}"
WEBROOT_DIR="${WEBROOT_DIR:-nginx/certbot}"
LETSENCRYPT_DIR="${LETSENCRYPT_DIR:-nginx/letsencrypt}"
CERTBOT_CERT_NAME="${CERTBOT_CERT_NAME:-writehumanly.net}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-support@writehumanly.net}"
CERTBOT_DOMAINS="${CERTBOT_DOMAINS:-writehumanly.net app.writehumanly.net admin.writehumanly.net api.writehumanly.net}"
CERTBOT_RENEWAL_WINDOW_DAYS="${CERTBOT_RENEWAL_WINDOW_DAYS:-30}"
CERTBOT_DRY_RUN="${CERTBOT_DRY_RUN:-0}"

cd "$REPO_DIR"

mkdir -p "$CERT_DIR" "$WEBROOT_DIR" "$LETSENCRYPT_DIR"

missing_domains=()
expires_within_window=1
if [[ -f "$CERT_DIR/fullchain.pem" ]]; then
  current_san="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -ext subjectAltName 2>/dev/null || true)"
  if openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -checkend "$((CERTBOT_RENEWAL_WINDOW_DAYS * 86400))" >/dev/null 2>&1; then
    expires_within_window=0
  fi
else
  current_san=""
fi

for domain in $CERTBOT_DOMAINS; do
  if ! grep -Fq "DNS:${domain}" <<<"$current_san"; then
    missing_domains+=("$domain")
  fi
done

if (( ${#missing_domains[@]} == 0 && expires_within_window == 0 )); then
  echo "==> TLS certificate already covers supported hostnames and is not inside the ${CERTBOT_RENEWAL_WINDOW_DAYS}-day renewal window."
  exit 0
fi

if (( ${#missing_domains[@]} > 0 )); then
  echo "==> TLS certificate is missing SAN entries: ${missing_domains[*]}"
fi

if (( expires_within_window == 1 )); then
  echo "==> TLS certificate is missing or expires within ${CERTBOT_RENEWAL_WINDOW_DAYS} days."
fi

echo "==> Requesting/renewing Let's Encrypt certificate via Docker webroot: ${CERTBOT_CERT_NAME}"

domain_args=()
for domain in $CERTBOT_DOMAINS; do
  domain_args+=("-d" "$domain")
done

staging_args=()
if [[ "${CERTBOT_STAGING:-}" == "1" ]]; then
  staging_args+=("--staging")
fi

dry_run_args=()
if [[ "$CERTBOT_DRY_RUN" == "1" ]]; then
  dry_run_args+=("--dry-run")
fi

expand_args=()
if [[ -f "$CERT_DIR/fullchain.pem" && ${#missing_domains[@]} -gt 0 ]]; then
  expand_args+=("--expand")
fi

docker run --rm \
  -v "$PWD/$WEBROOT_DIR:/var/www/certbot" \
  -v "$PWD/$LETSENCRYPT_DIR:/etc/letsencrypt" \
  certbot/certbot:latest \
  certonly \
  --webroot \
  -w /var/www/certbot \
  --email "$CERTBOT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  --cert-name "$CERTBOT_CERT_NAME" \
  "${expand_args[@]}" \
  "${staging_args[@]}" \
  "${dry_run_args[@]}" \
  "${domain_args[@]}"

if [[ "$CERTBOT_DRY_RUN" == "1" ]]; then
  echo "==> Certbot dry run succeeded. Existing production certificate was not replaced."
  exit 0
fi

docker run --rm \
  -v "$PWD/$LETSENCRYPT_DIR:/etc/letsencrypt:ro" \
  -v "$PWD/$CERT_DIR:/ssl" \
  alpine:3.20 \
  sh -ceu '
    cert_name="$1"
    cp -L "/etc/letsencrypt/live/${cert_name}/fullchain.pem" /ssl/fullchain.pem
    cp -L "/etc/letsencrypt/live/${cert_name}/privkey.pem" /ssl/privkey.pem
    chmod 644 /ssl/fullchain.pem
    chmod 600 /ssl/privkey.pem
  ' sh "$CERTBOT_CERT_NAME"

updated_san="$(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -ext subjectAltName)"
for domain in $CERTBOT_DOMAINS; do
  if ! grep -Fq "DNS:${domain}" <<<"$updated_san"; then
    echo "ERROR: updated certificate still does not include ${domain}" >&2
    exit 1
  fi
done

echo "==> TLS certificate now covers: ${CERTBOT_DOMAINS}"
