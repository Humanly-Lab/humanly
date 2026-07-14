#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 IMAGE EDITION SERVICE" >&2
  exit 2
fi

image="$1"
edition="$2"
service="$3"

case "$edition" in
  community|cloud) ;;
  *)
    echo "Unsupported edition: $edition" >&2
    exit 2
    ;;
esac

run_in_image() {
  docker run --rm --entrypoint sh "$image" -c "$1"
}

assert_in_image() {
  description="$1"
  command="$2"

  if ! run_in_image "$command"; then
    echo "Edition image assertion failed: ${description} (${image})" >&2
    exit 1
  fi
}

if [ "$edition" = "community" ]; then
  assert_in_image 'Community image must not contain /app/ee' 'test ! -e /app/ee'
  assert_in_image \
    'Community image must not contain @humanly-ee workspace links' \
    'test -z "$(find /app -path "*/node_modules/@humanly-ee*" -print -quit)"'

  case "$service" in
    frontend-user)
      if run_in_image "grep -R -F 'HUMANLY_EE_BILLING_UI' /app/packages/frontend-user/.next >/dev/null 2>&1"; then
        echo "Community Writer image contains the EE billing UI marker." >&2
        exit 1
      fi
      ;;
    frontend)
      if run_in_image "grep -R -F 'HUMANLY_CLOUD_UI_MARKER' /app/packages/frontend/.next >/dev/null 2>&1"; then
        echo "Community Publisher image contains the Cloud UI marker." >&2
        exit 1
      fi
      ;;
  esac
else
  case "$service" in
    backend)
      assert_in_image \
        'Cloud backend must contain the EE billing package' \
        'test -f /app/ee/packages/billing/dist/index.js'
      ;;
    frontend-user)
      assert_in_image \
        'Cloud Writer bundle must contain the EE billing UI marker' \
        "grep -R -F 'HUMANLY_EE_BILLING_UI' /app/packages/frontend-user/.next >/dev/null 2>&1"
      ;;
    frontend)
      assert_in_image \
        'Cloud Publisher bundle must contain the Cloud UI marker' \
        "grep -R -F 'HUMANLY_CLOUD_UI_MARKER' /app/packages/frontend/.next >/dev/null 2>&1"
      ;;
  esac
fi

echo "Edition image assertion passed: ${image} (${edition}/${service})."
