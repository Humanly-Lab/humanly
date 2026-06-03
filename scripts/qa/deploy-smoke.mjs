#!/usr/bin/env node

import tls from "node:tls";

import {
  addCheck,
  arg,
  boolArg,
  createQaRun,
  exitForReport,
  fetchJson,
  fetchWithTimeout,
  joinUrl,
  printReportLocation,
  runCheck,
  writeReport,
} from "./lib/qa-report.mjs";

const DEFAULT_APP_BASE = "https://app.writehumanly.net";
const DEFAULT_MARKETING_BASE = "https://writehumanly.net";
const DEFAULT_ADMIN_BASE = "https://admin.writehumanly.net";
const DEFAULT_API_BASE = "https://api.writehumanly.net/api/v1";

function showHelp() {
  console.log(`Humanly deploy/ops smoke harness

Usage:
  pnpm qa:deploy:smoke

Environment / flags:
  QA_APP_BASE / --app-base             User portal origin
  QA_MARKETING_BASE / --marketing-base Public marketing/homepage origin
  QA_ADMIN_BASE / --admin-base         Admin portal origin
  QA_DIRECT_API_BASE / --api-base      Direct API base URL
  QA_DEPLOY_REQUIRE_DIRECT_API=0       Downgrade direct API failures to warnings
  QA_OUTPUT_DIR / --output-dir         Report output directory

This harness is intentionally shallow: it checks deployment surfaces, not full
business flows. Use the browser E2E guide and AI usage harness for product
behavior.
`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
  process.exit(0);
}

const appBase = arg(
  "app-base",
  process.env.QA_APP_BASE || DEFAULT_APP_BASE,
).replace(/\/+$/, "");
const marketingBase = arg(
  "marketing-base",
  process.env.QA_MARKETING_BASE || DEFAULT_MARKETING_BASE,
).replace(/\/+$/, "");
const adminBase = arg(
  "admin-base",
  process.env.QA_ADMIN_BASE || DEFAULT_ADMIN_BASE,
).replace(/\/+$/, "");
const apiBase = arg(
  "api-base",
  process.env.QA_DIRECT_API_BASE || DEFAULT_API_BASE,
).replace(/\/+$/, "");
const requireDirectApi = boolArg(
  "require-direct-api",
  "QA_DEPLOY_REQUIRE_DIRECT_API",
  true,
);

const report = createQaRun({
  layer: "deploy-smoke",
  title: "Deploy/Ops Smoke Harness",
  config: {
    appBase,
    marketingBase,
    adminBase,
    apiBase,
    requireDirectApi,
  },
});

async function htmlCheck(id, title, url) {
  let html = "";
  await runCheck(
    report,
    {
      id,
      title,
      target: url,
    },
    async () => {
      const response = await fetchWithTimeout(url, { redirect: "manual" });
      html = await response.text();
      const contentType = response.headers.get("content-type") || "";
      if (![200, 307, 308].includes(response.status)) {
        throw new Error(`Expected 200 or redirect, got ${response.status}`);
      }
      return {
        details: {
          status: response.status,
          contentType,
          location: response.headers.get("location"),
          hasNextData:
            html.includes("/_next/static/") || html.includes("__NEXT_DATA__"),
        },
      };
    },
  );
  return html;
}

async function healthCheck(id, title, baseUrl, critical = true) {
  await runCheck(
    report,
    {
      id,
      title,
      target: joinUrl(baseUrl, "/health"),
      critical,
    },
    async () => {
      const { response, body } = await fetchJson(joinUrl(baseUrl, "/health"));
      if (response.status !== 200 || body?.status !== "ok") {
        throw new Error(`Expected 200 ok health, got ${response.status}`);
      }
      return { details: { status: response.status, body } };
    },
  );
}

async function apiRootCheck(id, title, baseUrl, critical = true) {
  await runCheck(
    report,
    {
      id,
      title,
      target: baseUrl,
      critical,
    },
    async () => {
      const { response, body } = await fetchJson(baseUrl);
      if (response.status !== 200 || body?.name !== "humanly API") {
        throw new Error(`Expected API metadata, got ${response.status}`);
      }
      return { details: { status: response.status, body } };
    },
  );
}

async function authGuardCheck(id, title, baseUrl, critical = true) {
  await runCheck(
    report,
    {
      id,
      title,
      target: joinUrl(baseUrl, "/auth/me"),
      critical,
    },
    async () => {
      const { response, body } = await fetchJson(joinUrl(baseUrl, "/auth/me"));
      if (![401, 403].includes(response.status)) {
        throw new Error(`Expected 401/403 auth guard, got ${response.status}`);
      }
      return { details: { status: response.status, body } };
    },
  );
}

function readTlsCertificate(hostname) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: true,
      },
      () => {
        const certificate = socket.getPeerCertificate();
        const result = {
          authorized: socket.authorized,
          authorizationError: socket.authorizationError,
          subject: certificate.subject,
          issuer: certificate.issuer,
          validFrom: certificate.valid_from,
          validTo: certificate.valid_to,
          subjectAltName: certificate.subjectaltname,
        };
        socket.end();
        resolve(result);
      },
    );

    socket.setTimeout(10_000, () => {
      socket.destroy(new Error(`Timed out reading TLS certificate for ${hostname}`));
    });
    socket.on("error", reject);
  });
}

async function tlsCertificateCheck(id, title, url) {
  const { hostname } = new URL(url);
  await runCheck(
    report,
    {
      id,
      title,
      target: `https://${hostname}:443`,
    },
    async () => {
      const certificate = await readTlsCertificate(hostname);
      if (!certificate.authorized) {
        throw new Error(
          `TLS certificate is not authorized: ${certificate.authorizationError}`,
        );
      }
      if (!certificate.subjectAltName?.includes(`DNS:${hostname}`)) {
        throw new Error(`TLS certificate SAN does not include ${hostname}`);
      }
      const expiresAt = Date.parse(certificate.validTo);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new Error(`TLS certificate is expired: ${certificate.validTo}`);
      }

      return {
        details: {
          hostname,
          validTo: certificate.validTo,
          daysRemaining: Math.floor(
            (expiresAt - Date.now()) / (24 * 60 * 60 * 1000),
          ),
          subjectAltName: certificate.subjectAltName,
        },
      };
    },
  );
}

function findFirstNextAsset(html) {
  const match = html.match(/src="([^"]*\/_next\/static\/[^"]+\.js)"/);
  return match?.[1] || null;
}

async function staticAssetCheck(id, title, baseUrl, html) {
  const assetPath = findFirstNextAsset(html);
  if (!assetPath) {
    addCheck(report, {
      id,
      title,
      target: baseUrl,
      status: "warn",
      details: {
        reason: "No Next.js static script reference found in root HTML.",
      },
    });
    return;
  }

  const assetUrl = assetPath.startsWith("http")
    ? assetPath
    : joinUrl(baseUrl, assetPath);
  await runCheck(
    report,
    {
      id,
      title,
      target: assetUrl,
    },
    async () => {
      const response = await fetchWithTimeout(assetUrl);
      if (response.status !== 200) {
        throw new Error(`Expected static asset 200, got ${response.status}`);
      }
      return {
        details: {
          status: response.status,
          contentType: response.headers.get("content-type"),
          cacheControl: response.headers.get("cache-control"),
        },
      };
    },
  );
}

const appHtml = await htmlCheck(
  "app-root",
  "User portal root is reachable",
  appBase,
);
const marketingHtml = await htmlCheck(
  "marketing-root",
  "Public marketing root is reachable",
  marketingBase,
);
const adminHtml = await htmlCheck(
  "admin-root",
  "Admin portal root is reachable",
  adminBase,
);
await staticAssetCheck(
  "marketing-static-asset",
  "Public marketing static asset is reachable",
  marketingBase,
  marketingHtml,
);
await staticAssetCheck(
  "app-static-asset",
  "User portal static asset is reachable",
  appBase,
  appHtml,
);
await staticAssetCheck(
  "admin-static-asset",
  "Admin portal static asset is reachable",
  adminBase,
  adminHtml,
);
await healthCheck(
  "marketing-proxy-health",
  "Public marketing API proxy health is ok",
  joinUrl(marketingBase, "/api/v1"),
);
await healthCheck(
  "app-proxy-health",
  "User portal API proxy health is ok",
  joinUrl(appBase, "/api/v1"),
);
await healthCheck(
  "admin-proxy-health",
  "Admin portal API proxy health is ok",
  joinUrl(adminBase, "/api/v1"),
);
await healthCheck(
  "direct-api-health",
  "Direct API health and TLS are ok",
  apiBase,
  requireDirectApi,
);
await apiRootCheck(
  "app-proxy-api-root",
  "User portal API proxy root exposes metadata",
  joinUrl(appBase, "/api/v1"),
);
await apiRootCheck(
  "admin-proxy-api-root",
  "Admin portal API proxy root exposes metadata",
  joinUrl(adminBase, "/api/v1"),
);
await apiRootCheck(
  "direct-api-root",
  "Direct API root exposes metadata",
  apiBase,
  requireDirectApi,
);
await authGuardCheck(
  "app-proxy-auth-guard",
  "User portal API proxy auth guard is active",
  joinUrl(appBase, "/api/v1"),
);
await authGuardCheck(
  "admin-proxy-auth-guard",
  "Admin portal API proxy auth guard is active",
  joinUrl(adminBase, "/api/v1"),
);
await authGuardCheck(
  "direct-api-auth-guard",
  "Direct API auth guard is active",
  apiBase,
  requireDirectApi,
);
await tlsCertificateCheck(
  "marketing-tls-certificate",
  "Public marketing TLS certificate covers host",
  marketingBase,
);
await tlsCertificateCheck(
  "app-tls-certificate",
  "User portal TLS certificate covers host",
  appBase,
);
await tlsCertificateCheck(
  "admin-tls-certificate",
  "Admin portal TLS certificate covers host",
  adminBase,
);
await tlsCertificateCheck(
  "direct-api-tls-certificate",
  "Direct API TLS certificate covers host",
  apiBase,
);

addCheck(report, {
  id: "socket-io-authenticated",
  title: "Authenticated Socket.IO connect",
  target: appBase,
  status: "skip",
  details: {
    reason:
      "Socket.IO requires a fresh authenticated user token; cover it in backend-contract mutating mode or browser E2E.",
  },
});

await writeReport(report);
printReportLocation(report);
exitForReport(report);
