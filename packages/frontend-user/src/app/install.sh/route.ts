import { NextResponse } from 'next/server';

const DEFAULT_SOURCE_REF = 'main';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const bootstrapScript = `#!/usr/bin/env sh
set -eu

HUMANLY_SOURCE_REF="\${HUMANLY_SOURCE_REF:-${DEFAULT_SOURCE_REF}}"
HUMANLY_INSTALLER_URL="\${HUMANLY_INSTALLER_URL:-https://raw.githubusercontent.com/Humanly-Lab/humanly/\${HUMANLY_SOURCE_REF}/scripts/install.sh}"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$HUMANLY_INSTALLER_URL" | sh -s -- --source-ref "$HUMANLY_SOURCE_REF" "$@"
elif command -v wget >/dev/null 2>&1; then
  wget -qO- "$HUMANLY_INSTALLER_URL" | sh -s -- --source-ref "$HUMANLY_SOURCE_REF" "$@"
else
  printf '%s\\n' "Humanly installer requires curl or wget." >&2
  exit 1
fi
`;

export function GET() {
  return new NextResponse(bootstrapScript, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Content-Type': 'text/x-shellscript; charset=utf-8',
    },
  });
}
