#!/usr/bin/env node

import crypto from 'node:crypto';
import {
  addCheck,
  arg,
  boolArg,
  createQaRun,
  exitForReport,
  fetchJson,
  joinUrl,
  normalizeApiBaseUrl,
  printReportLocation,
  runCheck,
  writeReport,
} from './lib/qa-report.mjs';

const DEFAULT_BASE_URL = 'http://localhost:3001/api/v1';
const DEFAULT_PASSWORD = 'ContractPassw0rd!';

function showHelp() {
  console.log(`Humanly backend contract harness

Usage:
  pnpm qa:backend:contract -- --base-url=http://localhost:3001/api/v1

Environment / flags:
  QA_BACKEND_BASE_URL / --base-url       API base URL, with or without /api/v1
  QA_BACKEND_MUTATING=1 / --mutating     Register/login a fresh user
  QA_BACKEND_EMAIL / --email             Email for mutating auth probe
  QA_BACKEND_PASSWORD / --password       Password for mutating auth probe
  QA_OUTPUT_DIR / --output-dir           Report output directory

Default checks are read-only: health, API root, and unauthenticated auth guard.
Mutating checks are opt-in so this command is safe to run against production
only when the caller intentionally asks for account creation.
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

const baseUrl = normalizeApiBaseUrl(arg('base-url', process.env.QA_BACKEND_BASE_URL), DEFAULT_BASE_URL);
const mutating = boolArg('mutating', 'QA_BACKEND_MUTATING', false);
const email =
  arg('email', process.env.QA_BACKEND_EMAIL) ||
  `contract-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@example.com`;
const password = arg('password', process.env.QA_BACKEND_PASSWORD || DEFAULT_PASSWORD);

const report = createQaRun({
  layer: 'backend-contract',
  title: 'Backend Contract Harness',
  config: {
    baseUrl,
    mutating,
    email: mutating ? email : undefined,
  },
});

await runCheck(
  report,
  {
    id: 'health',
    title: 'Versioned health endpoint returns ok',
    target: joinUrl(baseUrl, '/health'),
  },
  async () => {
    const { response, body } = await fetchJson(joinUrl(baseUrl, '/health'));
    if (response.status !== 200 || body?.status !== 'ok') {
      throw new Error(`Expected 200 ok health, got ${response.status}`);
    }
    return { details: { status: response.status, body } };
  },
);

await runCheck(
  report,
  {
    id: 'api-root',
    title: 'API root exposes version metadata',
    target: baseUrl,
  },
  async () => {
    const { response, body } = await fetchJson(baseUrl);
    if (response.status !== 200 || body?.name !== 'humanly API') {
      throw new Error(`Expected API root metadata, got ${response.status}`);
    }
    return { details: { status: response.status, body } };
  },
);

await runCheck(
  report,
  {
    id: 'auth-guard',
    title: 'Authenticated route rejects missing token',
    target: joinUrl(baseUrl, '/auth/me'),
  },
  async () => {
    const { response, body } = await fetchJson(joinUrl(baseUrl, '/auth/me'));
    if (![401, 403].includes(response.status)) {
      throw new Error(`Expected 401/403 for missing token, got ${response.status}`);
    }
    return { details: { status: response.status, body } };
  },
);

if (mutating) {
  let accessToken = null;

  await runCheck(
    report,
    {
      id: 'auth-register',
      title: 'Fresh user registration succeeds',
      target: joinUrl(baseUrl, '/auth/register'),
    },
    async () => {
      const { response, body } = await fetchJson(joinUrl(baseUrl, '/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'user' }),
      });
      if (![200, 201, 409].includes(response.status)) {
        throw new Error(`Expected 201 registration or 409 existing user, got ${response.status}`);
      }
      return { details: { status: response.status, userId: body?.data?.user?.id || null } };
    },
  );

  await runCheck(
    report,
    {
      id: 'auth-login',
      title: 'Fresh user login returns access token',
      target: joinUrl(baseUrl, '/auth/login'),
    },
    async () => {
      const { response, body } = await fetchJson(joinUrl(baseUrl, '/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'user' }),
      });
      accessToken = body?.data?.accessToken || null;
      if (response.status !== 200 || !accessToken) {
        throw new Error(`Expected login token, got ${response.status}`);
      }
      return { details: { status: response.status, hasAccessToken: Boolean(accessToken) } };
    },
  );

  await runCheck(
    report,
    {
      id: 'auth-me',
      title: 'Authenticated /auth/me returns current user',
      target: joinUrl(baseUrl, '/auth/me'),
    },
    async () => {
      const { response, body } = await fetchJson(joinUrl(baseUrl, '/auth/me'), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status !== 200 || !body?.data?.user?.id) {
        throw new Error(`Expected current user, got ${response.status}`);
      }
      return { details: { status: response.status, userId: body.data.user.id } };
    },
  );
} else {
  addCheck(report, {
    id: 'auth-mutating',
    title: 'Fresh register/login probes',
    target: joinUrl(baseUrl, '/auth/register'),
    status: 'skip',
    details: {
      reason: 'Set QA_BACKEND_MUTATING=1 or pass --mutating to run account-creating contract checks.',
    },
  });
}

await writeReport(report);
printReportLocation(report);
exitForReport(report);
