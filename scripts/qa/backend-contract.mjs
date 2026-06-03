#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  addCheck,
  arg,
  boolArg,
  createQaRun,
  exitForReport,
  fetchJson,
  fetchWithTimeout,
  joinUrl,
  normalizeApiBaseUrl,
  printReportLocation,
  runCheck,
  writeReport,
} from "./lib/qa-report.mjs";

const require = createRequire(
  fileURLToPath(
    new URL("../../packages/backend/package.json", import.meta.url),
  ),
);
const PDFDocument = require("pdfkit");

const DEFAULT_BASE_URL = "http://localhost:3001/api/v1";
const DEFAULT_PASSWORD = "ContractPassw0rd!";
const QA_AI_SETTINGS_BASE_URL = "https://api.together.xyz/v1";
const QA_AI_SETTINGS_MODEL = "moonshotai/Kimi-K2.6";
const QA_AI_SETTINGS_SHORTCUT_MAX_TOKENS = 1024;
const QA_AI_SETTINGS_CHAT_MAX_TOKENS = 4096;

function showHelp() {
  console.log(`Humanly backend contract harness

Usage:
  pnpm qa:backend:contract -- --base-url=http://localhost:3001/api/v1

Environment / flags:
  QA_BACKEND_BASE_URL / --base-url       API base URL, with or without /api/v1
  QA_BACKEND_MUTATING=1 / --mutating     Run authenticated mutating checks
  QA_BACKEND_STORAGE_STATE / --storage-state
                                          Reuse a verified Playwright storageState
  QA_BACKEND_ACCESS_TOKEN / --access-token
                                          Reuse a verified access token
  QA_BACKEND_EMAIL / --email             Email for mutating auth probe
  QA_BACKEND_PASSWORD / --password       Password for mutating auth probe
  QA_BACKEND_FILE_PROBE=1 / --file-probe Upload/list/stream a small PDF during mutating mode
  QA_BACKEND_KEEP_DATA=1 / --keep-data   Keep created documents for debugging
  QA_OUTPUT_DIR / --output-dir           Report output directory

Default checks are read-only: health, API root, and unauthenticated auth guard.
Mutating checks are opt-in. Production runs should pass a verified storageState
or access token so the harness does not create a fresh unverified account.
Mutating mode also validates AI settings token-budget contracts without calling
a live AI provider.
`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
  process.exit(0);
}

const baseUrl = normalizeApiBaseUrl(
  arg("base-url", process.env.QA_BACKEND_BASE_URL),
  DEFAULT_BASE_URL,
);
const mutating = boolArg("mutating", "QA_BACKEND_MUTATING", false);
const fileProbe = boolArg("file-probe", "QA_BACKEND_FILE_PROBE", false);
const keepData = boolArg("keep-data", "QA_BACKEND_KEEP_DATA", false);
const storageStatePath = arg(
  "storage-state",
  process.env.QA_BACKEND_STORAGE_STATE,
);
const suppliedAccessToken = arg(
  "access-token",
  process.env.QA_BACKEND_ACCESS_TOKEN,
);
const authMode = mutating
  ? suppliedAccessToken
    ? "access-token"
    : storageStatePath
      ? "storage-state"
      : "fresh-register"
  : undefined;
const email =
  arg("email", process.env.QA_BACKEND_EMAIL) ||
  `contract-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@example.com`;
const password = arg(
  "password",
  process.env.QA_BACKEND_PASSWORD || DEFAULT_PASSWORD,
);
const createdDocumentIds = [];
const uploadedFileIds = [];
let aiSettingsTouched = false;

const report = createQaRun({
  layer: "backend-contract",
  title: "Backend Contract Harness",
  config: {
    baseUrl,
    mutating,
    fileProbe,
    keepData,
    authMode,
    hasStorageState: mutating ? Boolean(storageStatePath) : undefined,
    hasAccessToken: mutating ? Boolean(suppliedAccessToken) : undefined,
    email: authMode === "fresh-register" ? email : undefined,
  },
});

function makeLexicalContent(text) {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr",
      format: "",
      indent: 0,
      children: [
        {
          type: "paragraph",
          version: 1,
          direction: "ltr",
          format: "",
          indent: 0,
          children: [
            {
              type: "text",
              version: 1,
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text,
            },
          ],
        },
      ],
    },
  };
}

function makeEvents(runId, text) {
  const now = Date.now();
  return [
    {
      eventType: "focus",
      timestamp: new Date(now).toISOString(),
      cursorPosition: 0,
      metadata: { qaRun: runId, phase: "focus" },
    },
    {
      eventType: "input",
      timestamp: new Date(now + 1).toISOString(),
      keyChar: "H",
      cursorPosition: 1,
      textBefore: "",
      textAfter: text,
      metadata: { qaRun: runId, phase: "input" },
    },
    {
      eventType: "paste",
      timestamp: new Date(now + 2).toISOString(),
      cursorPosition: text.length,
      textBefore: text,
      textAfter: `${text} pasted`,
      metadata: { qaRun: runId, phase: "paste" },
    },
    {
      eventType: "blur",
      timestamp: new Date(now + 3).toISOString(),
      cursorPosition: text.length,
      metadata: { qaRun: runId, phase: "blur" },
    },
  ];
}

async function makePdfBuffer(runId) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      size: "LETTER",
      margin: 48,
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.addPage();
    doc.fontSize(18).text("Humanly QA Contract PDF", { underline: true });
    doc.moveDown();
    doc
      .fontSize(11)
      .text(`Run ${runId}: small PDF upload, list, and stream contract probe.`);
    doc.end();
  });
}

async function fetchAuthedJson(pathname, accessToken, options = {}) {
  return fetchJson(joinUrl(baseUrl, pathname), {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
}

function formatBody(body) {
  if (!body) return "";
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return ` body=${text.slice(0, 500)}`;
}

async function loadAccessTokenFromStorageState(filePath, apiBaseUrl) {
  const raw = await fs.readFile(filePath, "utf8");
  let storageState = null;
  try {
    storageState = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Expected Playwright storageState JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const origins = Array.isArray(storageState?.origins)
    ? storageState.origins
    : [];
  const baseOrigin = new URL(apiBaseUrl).origin;
  const orderedOrigins = [
    ...origins.filter((entry) => entry?.origin === baseOrigin),
    ...origins.filter((entry) => entry?.origin !== baseOrigin),
  ];

  for (const origin of orderedOrigins) {
    const localStorage = Array.isArray(origin?.localStorage)
      ? origin.localStorage
      : [];
    const tokenEntry = localStorage.find(
      (entry) => entry?.name === "accessToken",
    );
    if (tokenEntry?.value) {
      return tokenEntry.value;
    }
  }

  throw new Error(
    `No accessToken localStorage entry found in storageState for ${baseOrigin}`,
  );
}

await runCheck(
  report,
  {
    id: "health",
    title: "Versioned health endpoint returns ok",
    target: joinUrl(baseUrl, "/health"),
  },
  async () => {
    const { response, body } = await fetchJson(joinUrl(baseUrl, "/health"));
    if (response.status !== 200 || body?.status !== "ok") {
      throw new Error(`Expected 200 ok health, got ${response.status}`);
    }
    return { details: { status: response.status, body } };
  },
);

await runCheck(
  report,
  {
    id: "api-root",
    title: "API root exposes version metadata",
    target: baseUrl,
  },
  async () => {
    const { response, body } = await fetchJson(baseUrl);
    if (response.status !== 200 || body?.name !== "humanly API") {
      throw new Error(`Expected API root metadata, got ${response.status}`);
    }
    return { details: { status: response.status, body } };
  },
);

await runCheck(
  report,
  {
    id: "auth-guard",
    title: "Authenticated route rejects missing token",
    target: joinUrl(baseUrl, "/auth/me"),
  },
  async () => {
    const { response, body } = await fetchJson(joinUrl(baseUrl, "/auth/me"));
    if (![401, 403].includes(response.status)) {
      throw new Error(
        `Expected 401/403 for missing token, got ${response.status}`,
      );
    }
    return { details: { status: response.status, body } };
  },
);

if (mutating) {
  let accessToken = null;
  let documentId = null;
  let fileId = null;
  const runText = `Humanly backend contract ${report.run.id}`;

  if (authMode === "storage-state" || authMode === "access-token") {
    await runCheck(
      report,
      {
        id: "auth-verified-session",
        title: "Verified auth session provides access token",
        target: authMode === "storage-state" ? "storageState" : "accessToken",
      },
      async () => {
        accessToken =
          authMode === "access-token"
            ? suppliedAccessToken
            : await loadAccessTokenFromStorageState(storageStatePath, baseUrl);
        if (!accessToken) {
          throw new Error("Expected verified access token");
        }
        return {
          details: {
            authMode,
            hasAccessToken: Boolean(accessToken),
            hasStorageState: Boolean(storageStatePath),
          },
        };
      },
    );
  } else {
    await runCheck(
      report,
      {
        id: "auth-register",
        title: "Fresh user registration succeeds",
        target: joinUrl(baseUrl, "/auth/register"),
      },
      async () => {
        const { response, body } = await fetchJson(
          joinUrl(baseUrl, "/auth/register"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, role: "user" }),
          },
        );
        if (![200, 201, 409].includes(response.status)) {
          throw new Error(
            `Expected 201 registration or 409 existing user, got ${response.status}`,
          );
        }
        return {
          details: {
            status: response.status,
            userId: body?.data?.user?.id || null,
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "auth-login",
        title: "Fresh user login returns access token",
        target: joinUrl(baseUrl, "/auth/login"),
      },
      async () => {
        const { response, body } = await fetchJson(
          joinUrl(baseUrl, "/auth/login"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, role: "user" }),
          },
        );
        accessToken = body?.data?.accessToken || null;
        if (response.status !== 200 || !accessToken) {
          throw new Error(`Expected login token, got ${response.status}`);
        }
        return {
          details: {
            status: response.status,
            hasAccessToken: Boolean(accessToken),
          },
        };
      },
    );
  }

  await runCheck(
    report,
    {
      id: "auth-me",
      title: "Authenticated /auth/me returns current user",
      target: joinUrl(baseUrl, "/auth/me"),
    },
    async () => {
      const { response, body } = await fetchJson(joinUrl(baseUrl, "/auth/me"), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status !== 200 || !body?.data?.user?.id) {
        throw new Error(`Expected current user, got ${response.status}`);
      }
      return {
        details: { status: response.status, userId: body.data.user.id },
      };
    },
  );

  await runCheck(
    report,
    {
      id: "ai-settings-save-token-budget",
      title: "Save AI settings with shortcut/chat token budgets",
      target: joinUrl(baseUrl, "/ai/settings"),
    },
    async () => {
      const { response, body } = await fetchAuthedJson(
        "/ai/settings",
        accessToken,
        {
          method: "PUT",
          body: JSON.stringify({
            apiKey: "qa-contract-not-a-real-key",
            baseUrl: QA_AI_SETTINGS_BASE_URL,
            model: QA_AI_SETTINGS_MODEL,
            shortcutMaxTokens: QA_AI_SETTINGS_SHORTCUT_MAX_TOKENS,
            chatMaxTokens: QA_AI_SETTINGS_CHAT_MAX_TOKENS,
          }),
        },
      );
      if (response.status !== 200 || body?.success !== true) {
        throw new Error(
          `Expected AI settings save success, got ${response.status}${formatBody(body)}`,
        );
      }
      aiSettingsTouched = true;
      return {
        details: {
          status: response.status,
          model: QA_AI_SETTINGS_MODEL,
          shortcutMaxTokens: QA_AI_SETTINGS_SHORTCUT_MAX_TOKENS,
          chatMaxTokens: QA_AI_SETTINGS_CHAT_MAX_TOKENS,
        },
      };
    },
  );

  if (aiSettingsTouched) {
    await runCheck(
      report,
      {
        id: "ai-settings-get-token-budget",
        title: "Read AI settings exposes public shortcut/chat budgets",
        target: joinUrl(baseUrl, "/ai/settings"),
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          "/ai/settings",
          accessToken,
        );
        const settings = body?.data;
        if (
          response.status !== 200 ||
          settings?.baseUrl !== QA_AI_SETTINGS_BASE_URL ||
          settings?.model !== QA_AI_SETTINGS_MODEL ||
          settings?.shortcutMaxTokens !== QA_AI_SETTINGS_SHORTCUT_MAX_TOKENS ||
          settings?.chatMaxTokens !== QA_AI_SETTINGS_CHAT_MAX_TOKENS ||
          settings?.apiKey
        ) {
          throw new Error(
            `Expected public AI settings with new token budget fields, got ${response.status}${formatBody(body)}`,
          );
        }
        return {
          details: {
            status: response.status,
            baseUrl: settings.baseUrl,
            model: settings.model,
            shortcutMaxTokens: settings.shortcutMaxTokens,
            chatMaxTokens: settings.chatMaxTokens,
            hasApiKey: Boolean(settings.hasApiKey),
            maskedApiKey: settings.maskedApiKey,
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "ai-settings-legacy-token-budget",
        title: "Legacy response/agent token budget fields remain accepted",
        target: joinUrl(baseUrl, "/ai/settings"),
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          "/ai/settings",
          accessToken,
          {
            method: "PUT",
            body: JSON.stringify({
              apiKey: "__use_existing__",
              baseUrl: QA_AI_SETTINGS_BASE_URL,
              model: QA_AI_SETTINGS_MODEL,
              responseMaxTokens: 1536,
              agentMaxTokens: 6144,
            }),
          },
        );
        if (response.status !== 200) {
          throw new Error(
            `Expected legacy AI settings save success, got ${response.status}${formatBody(body)}`,
          );
        }
        const current = await fetchAuthedJson("/ai/settings", accessToken);
        const settings = current.body?.data;
        if (
          current.response.status !== 200 ||
          settings?.shortcutMaxTokens !== 1536 ||
          settings?.chatMaxTokens !== 6144
        ) {
          throw new Error(
            `Expected legacy fields to map to shortcut/chat budgets, got ${current.response.status}${formatBody(current.body)}`,
          );
        }
        return {
          details: {
            status: response.status,
            shortcutMaxTokens: settings.shortcutMaxTokens,
            chatMaxTokens: settings.chatMaxTokens,
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "ai-settings-invalid-budget-rejected",
        title: "Invalid AI token budget is rejected",
        target: joinUrl(baseUrl, "/ai/settings"),
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          "/ai/settings",
          accessToken,
          {
            method: "PUT",
            body: JSON.stringify({
              apiKey: "__use_existing__",
              baseUrl: QA_AI_SETTINGS_BASE_URL,
              model: QA_AI_SETTINGS_MODEL,
              shortcutMaxTokens: 128,
              chatMaxTokens: QA_AI_SETTINGS_CHAT_MAX_TOKENS,
            }),
          },
        );
        if (response.status !== 400 || body?.success !== false) {
          throw new Error(
            `Expected invalid token budget rejection, got ${response.status}${formatBody(body)}`,
          );
        }
        return { details: { status: response.status, error: body?.error } };
      },
    );
  } else {
    for (const check of [
      [
        "ai-settings-get-token-budget",
        "Read AI settings exposes public shortcut/chat budgets",
      ],
      [
        "ai-settings-legacy-token-budget",
        "Legacy response/agent token budget fields remain accepted",
      ],
      [
        "ai-settings-invalid-budget-rejected",
        "Invalid AI token budget is rejected",
      ],
    ]) {
      addCheck(report, {
        id: check[0],
        title: check[1],
        target: joinUrl(baseUrl, "/ai/settings"),
        status: "skip",
        details: {
          reason:
            "Skipped because AI settings save did not establish the required precondition.",
        },
      });
    }
  }

  await runCheck(
    report,
    {
      id: "documents-create",
      title: "Create a draft document",
      target: joinUrl(baseUrl, "/documents"),
    },
    async () => {
      const { response, body } = await fetchAuthedJson(
        "/documents",
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            title: `QA Contract ${report.run.id}`,
            description: "Generated by qa:backend:contract mutating mode.",
            content: makeLexicalContent(runText),
            status: "draft",
          }),
        },
      );
      documentId = body?.data?.document?.id || null;
      if (documentId) createdDocumentIds.push(documentId);
      if (response.status !== 201 || !documentId) {
        throw new Error(
          `Expected document id, got ${response.status}${formatBody(body)}`,
        );
      }
      return { details: { status: response.status, documentId } };
    },
  );

  if (documentId) {
    await runCheck(
      report,
      {
        id: "documents-get",
        title: "Read created document",
        target: documentId
          ? joinUrl(baseUrl, `/documents/${documentId}`)
          : "/documents/:id",
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          `/documents/${documentId}`,
          accessToken,
        );
        if (
          response.status !== 200 ||
          body?.data?.document?.id !== documentId
        ) {
          throw new Error(`Expected created document, got ${response.status}`);
        }
        return {
          details: {
            status: response.status,
            documentId,
            title: body.data.document.title,
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "documents-update",
        title: "Update document title and content",
        target: documentId
          ? joinUrl(baseUrl, `/documents/${documentId}`)
          : "/documents/:id",
      },
      async () => {
        const updatedText = `${runText} updated`;
        const { response, body } = await fetchAuthedJson(
          `/documents/${documentId}`,
          accessToken,
          {
            method: "PUT",
            body: JSON.stringify({
              title: `QA Contract ${report.run.id} Updated`,
              content: makeLexicalContent(updatedText),
              status: "draft",
            }),
          },
        );
        if (
          response.status !== 200 ||
          body?.data?.document?.id !== documentId
        ) {
          throw new Error(`Expected updated document, got ${response.status}`);
        }
        return {
          details: {
            status: response.status,
            wordCount: body.data.document.wordCount,
            characterCount: body.data.document.characterCount,
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "documents-events-post",
        title: "Track representative document events",
        target: documentId
          ? joinUrl(baseUrl, `/documents/${documentId}/events`)
          : "/documents/:id/events",
      },
      async () => {
        const events = makeEvents(report.run.id, runText);
        const { response, body } = await fetchAuthedJson(
          `/documents/${documentId}/events`,
          accessToken,
          {
            method: "POST",
            body: JSON.stringify({ events }),
          },
        );
        if (response.status !== 200) {
          throw new Error(`Expected tracked events, got ${response.status}`);
        }
        return {
          details: {
            status: response.status,
            eventCount: events.length,
            message: body?.message,
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "documents-events-get",
        title: "Query tracked document events",
        target: documentId
          ? joinUrl(baseUrl, `/documents/${documentId}/events?limit=10`)
          : "/documents/:id/events",
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          `/documents/${documentId}/events?limit=10`,
          accessToken,
        );
        const events = body?.data?.events || [];
        if (response.status !== 200 || events.length < 1) {
          throw new Error(
            `Expected at least one event, got ${response.status}`,
          );
        }
        return {
          details: {
            status: response.status,
            eventCount: events.length,
            total: body?.count,
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "documents-stats",
        title: "Read document statistics",
        target: documentId
          ? joinUrl(baseUrl, `/documents/${documentId}/stats`)
          : "/documents/:id/stats",
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          `/documents/${documentId}/stats`,
          accessToken,
        );
        const stats = body?.data?.statistics;
        if (
          response.status !== 200 ||
          !stats ||
          Number(stats.totalEvents || 0) < 1
        ) {
          throw new Error(
            `Expected statistics with events, got ${response.status}`,
          );
        }
        return {
          details: {
            status: response.status,
            totalEvents: stats.totalEvents,
            typingEvents: stats.typingEvents,
            pasteEvents: stats.pasteEvents,
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "documents-list-search",
        title: "List/search documents includes QA document",
        target: joinUrl(
          baseUrl,
          `/documents?limit=10&search=${encodeURIComponent(report.run.id)}`,
        ),
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          `/documents?limit=10&search=${encodeURIComponent(report.run.id)}`,
          accessToken,
        );
        const documents = body?.data || [];
        if (
          response.status !== 200 ||
          !documents.some((document) => document.id === documentId)
        ) {
          throw new Error(
            `Expected list to include created document, got ${response.status}`,
          );
        }
        return {
          details: { status: response.status, matched: documents.length },
        };
      },
    );

    if (fileProbe) {
      await runCheck(
        report,
        {
          id: "files-upload-pdf",
          title: "Upload a small document PDF",
          target: documentId
            ? joinUrl(baseUrl, `/documents/${documentId}/files`)
            : "/documents/:id/files",
        },
        async () => {
          const pdfBuffer = await makePdfBuffer(report.run.id);
          const form = new FormData();
          form.append("title", "QA Contract PDF");
          form.append(
            "pdf",
            new Blob([pdfBuffer], { type: "application/pdf" }),
            "qa-contract.pdf",
          );
          const { response, body } = await fetchJson(
            joinUrl(baseUrl, `/documents/${documentId}/files`),
            {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` },
              body: form,
            },
          );
          fileId = body?.data?.id || body?.data?.file?.id || null;
          if (fileId) uploadedFileIds.push(fileId);
          if (response.status !== 200 && response.status !== 201) {
            throw new Error(
              `Expected PDF upload success, got ${response.status}`,
            );
          }
          return { details: { status: response.status, fileId } };
        },
      );

      await runCheck(
        report,
        {
          id: "files-list-document",
          title: "List uploaded document files",
          target: documentId
            ? joinUrl(baseUrl, `/documents/${documentId}/files`)
            : "/documents/:id/files",
        },
        async () => {
          const { response, body } = await fetchAuthedJson(
            `/documents/${documentId}/files`,
            accessToken,
          );
          if (response.status !== 200) {
            throw new Error(`Expected file list, got ${response.status}`);
          }
          const files = body?.data?.files || body?.data || [];
          return {
            details: {
              status: response.status,
              fileCount: Array.isArray(files) ? files.length : null,
            },
          };
        },
      );

      if (fileId) {
        await runCheck(
          report,
          {
            id: "files-stream-pdf",
            title: "Stream uploaded PDF content",
            target: joinUrl(baseUrl, `/files/${fileId}/content`),
          },
          async () => {
            const response = await fetchWithTimeout(
              joinUrl(baseUrl, `/files/${fileId}/content`),
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              },
            );
            if (response.status !== 200) {
              throw new Error(`Expected PDF stream, got ${response.status}`);
            }
            return {
              details: {
                status: response.status,
                contentType: response.headers.get("content-type"),
                contentLength: response.headers.get("content-length"),
              },
            };
          },
        );
      }
    } else {
      addCheck(report, {
        id: "files-pdf-probe",
        title: "PDF upload/list/stream probe",
        target: documentId
          ? joinUrl(baseUrl, `/documents/${documentId}/files`)
          : "/documents/:id/files",
        status: "skip",
        details: {
          reason:
            "Set QA_BACKEND_FILE_PROBE=1 or pass --file-probe during mutating mode to run PDF file checks.",
        },
      });
    }
  } else {
    addCheck(report, {
      id: "documents-dependent-probes",
      title: "Document read/update/events/stats/file probes",
      target: joinUrl(baseUrl, "/documents/:id"),
      status: "skip",
      details: {
        reason:
          "Skipped because document creation did not establish the required precondition.",
      },
    });
  }

  if (!keepData && documentId) {
    await runCheck(
      report,
      {
        id: "documents-cleanup",
        title: "Delete created QA document",
        target: joinUrl(baseUrl, `/documents/${documentId}`),
        critical: false,
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          `/documents/${documentId}`,
          accessToken,
          {
            method: "DELETE",
          },
        );
        if (![200, 404].includes(response.status)) {
          throw new Error(`Expected cleanup success, got ${response.status}`);
        }
        return { details: { status: response.status, message: body?.message } };
      },
    );
  } else if (keepData) {
    addCheck(report, {
      id: "documents-cleanup",
      title: "Delete created QA document",
      target: documentId
        ? joinUrl(baseUrl, `/documents/${documentId}`)
        : "/documents/:id",
      status: "skip",
      details: {
        reason: "QA_BACKEND_KEEP_DATA=1 was set.",
        createdDocumentIds,
        uploadedFileIds,
      },
    });
  }

  if (!keepData && aiSettingsTouched) {
    await runCheck(
      report,
      {
        id: "ai-settings-cleanup",
        title: "Delete QA AI settings",
        target: joinUrl(baseUrl, "/ai/settings"),
        critical: false,
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          "/ai/settings",
          accessToken,
          {
            method: "DELETE",
          },
        );
        if (![200, 404].includes(response.status)) {
          throw new Error(
            `Expected AI settings cleanup success, got ${response.status}`,
          );
        }
        return {
          details: {
            status: response.status,
            message: body?.message || body?.error,
          },
        };
      },
    );
  } else if (keepData && aiSettingsTouched) {
    addCheck(report, {
      id: "ai-settings-cleanup",
      title: "Delete QA AI settings",
      target: joinUrl(baseUrl, "/ai/settings"),
      status: "skip",
      details: {
        reason: "QA_BACKEND_KEEP_DATA=1 was set.",
      },
    });
  }
} else {
  addCheck(report, {
    id: "auth-mutating",
    title: "Authenticated mutating probes",
    target: joinUrl(baseUrl, "/auth/register"),
    status: "skip",
    details: {
      reason:
        "Set QA_BACKEND_MUTATING=1 or pass --mutating to run authenticated contract checks.",
    },
  });
}

await writeReport(report);
printReportLocation(report);
exitForReport(report);
