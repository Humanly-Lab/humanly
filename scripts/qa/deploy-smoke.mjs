#!/usr/bin/env node

import {
  addCheck,
  arg,
  boolArg,
  createQaRun,
  exitForReport,
  fetchJson,
  joinUrl,
  printReportLocation,
  runCheck,
  writeReport,
} from './lib/qa-report.mjs';

const DEFAULT_APP_BASE = 'https://app.writehumanly.net';
const DEFAULT_ADMIN_BASE = 'https://admin.writehumanly.net';
const DEFAULT_API_BASE = 'https://api.writehumanly.net/api/v1';

function showHelp() {
  console.log(`Humanly deploy/ops smoke harness

Usage:
  pnpm qa:deploy:smoke

Environment / flags:
  QA_APP_BASE / --app-base             User portal origin
  QA_ADMIN_BASE / --admin-base         Admin portal origin
  QA_DIRECT_API_BASE / --api-base      Direct API base URL
  QA_DEPLOY_REQUIRE_DIRECT_API=0       Downgrade direct API failures to warnings
  QA_OUTPUT_DIR / --output-dir         Report output directory

This harness is intentionally shallow: it checks deployment surfaces, not full
business flows. Use the browser E2E guide and AI usage harness for product
behavior.
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

const appBase = arg('app-base', process.env.QA_APP_BASE || DEFAULT_APP_BASE).replace(/\/+$/, '');
const adminBase = arg('admin-base', process.env.QA_ADMIN_BASE || DEFAULT_ADMIN_BASE).replace(/\/+$/, '');
const apiBase = arg('api-base', process.env.QA_DIRECT_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
const requireDirectApi = boolArg('require-direct-api', 'QA_DEPLOY_REQUIRE_DIRECT_API', true);

const report = createQaRun({
  layer: 'deploy-smoke',
  title: 'Deploy/Ops Smoke Harness',
  config: {
    appBase,
    adminBase,
    apiBase,
    requireDirectApi,
  },
});

async function htmlCheck(id, title, url) {
  await runCheck(
    report,
    {
      id,
      title,
      target: url,
    },
    async () => {
      const response = await fetch(url, { redirect: 'manual' });
      const contentType = response.headers.get('content-type') || '';
      if (![200, 307, 308].includes(response.status)) {
        throw new Error(`Expected 200 or redirect, got ${response.status}`);
      }
      return {
        details: {
          status: response.status,
          contentType,
          location: response.headers.get('location'),
        },
      };
    },
  );
}

async function healthCheck(id, title, baseUrl, critical = true) {
  await runCheck(
    report,
    {
      id,
      title,
      target: joinUrl(baseUrl, '/health'),
      critical,
    },
    async () => {
      const { response, body } = await fetchJson(joinUrl(baseUrl, '/health'));
      if (response.status !== 200 || body?.status !== 'ok') {
        throw new Error(`Expected 200 ok health, got ${response.status}`);
      }
      return { details: { status: response.status, body } };
    },
  );
}

await htmlCheck('app-root', 'User portal root is reachable', appBase);
await htmlCheck('admin-root', 'Admin portal root is reachable', adminBase);
await healthCheck('app-proxy-health', 'User portal API proxy health is ok', joinUrl(appBase, '/api/v1'));
await healthCheck('admin-proxy-health', 'Admin portal API proxy health is ok', joinUrl(adminBase, '/api/v1'));
await healthCheck('direct-api-health', 'Direct API health and TLS are ok', apiBase, requireDirectApi);

addCheck(report, {
  id: 'socket-io-authenticated',
  title: 'Authenticated Socket.IO connect',
  target: appBase,
  status: 'skip',
  details: {
    reason:
      'Socket.IO requires a fresh authenticated user token; cover it in backend-contract mutating mode or browser E2E.',
  },
});

await writeReport(report);
printReportLocation(report);
exitForReport(report);
