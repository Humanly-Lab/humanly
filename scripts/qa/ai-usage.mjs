#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import {
  addCheck,
  arg,
  boolArg,
  createQaRun,
  exitForReport,
  fetchJson,
  intArg,
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

const PROVIDERS = {
  together: {
    baseUrl: "https://api.together.xyz/v1",
    keyEnv: "TOGETHER_API_KEY",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    extraHeaders: {
      "HTTP-Referer": "https://app.writehumanly.net",
      "X-Title": "Humanly QA Harness",
    },
  },
};

const DEFAULT_APP_BASE_URL = "http://localhost:3001/api/v1";

function makeQaLoginValue() {
  return ["qa", Date.now(), crypto.randomBytes(6).toString("hex"), "A1"].join("-");
}

function makeQaReferenceMarker() {
  return ["qa-marker", crypto.randomBytes(6).toString("hex")].join("-");
}

const appReferenceMarker = makeQaReferenceMarker();

function showHelp() {
  console.log(`Humanly AI usage harness

Usage:
  pnpm qa:ai:usage
  QA_AI_EXECUTE=1 QA_AI_PROVIDER=together QA_AI_MODEL=moonshotai/Kimi-K2.6 TOGETHER_API_KEY=... pnpm qa:ai:usage

Environment / flags:
  QA_AI_EXECUTE=1 / --execute          Run live provider checks. Default is plan-only.
  QA_AI_PROVIDER / --provider          together | openrouter
  QA_AI_MODEL / --model                Provider model id for smoke checks
  QA_AI_MODELS / --models              Comma-separated provider model ids
  QA_AI_API_KEY                        Overrides provider-specific key env
  QA_AI_BASE_URL / --base-url          OpenAI-compatible provider base URL
  QA_AI_MANIFEST / --manifest          Matrix manifest path
  QA_AI_DOCUMENTS / --documents        Comma-separated manifest document ids
  QA_AI_QUERY_TYPES / --query-types    Comma-separated manifest query ids
  QA_AI_SHORTCUT_MAX_TOKENS                Shortcut smoke max_tokens (default 1024)
  QA_AI_CHAT_MAX_TOKENS                Chat tool smoke max_tokens (default 4096)
  QA_AI_DISABLE_REASONING=1 / --disable-reasoning
                                      Disable provider reasoning for shortcut-style smoke
  QA_AI_IMAGE_EXECUTE=1 / --image-execute  Run provider image-input smoke
  QA_AI_IMAGE_MODELS / --image-models      Comma-separated vision model ids. Defaults to selected models.
  QA_AI_APP_EXECUTE=1 / --app-execute  Run Humanly app-level AI smoke
  QA_AI_APP_BASE_URL / --app-base-url  Humanly API base URL (default localhost backend)
  QA_AI_APP_PROVIDER_BASE_URL          Provider base URL saved into Humanly AI settings
  QA_AI_APP_MODEL                      Model saved into Humanly AI settings
  QA_AI_APP_API_KEY                    Provider key saved into the transient QA user
  QA_AI_APP_KEEP_DATA=1                Keep created document/settings for debugging
  QA_AI_APP_REQUIRE_TOOL_CALL=0        Downgrade missing Humanly tool-call trace to warning
  QA_OUTPUT_DIR / --output-dir         Report output directory

Provider smoke checks raw OpenAI-compatible behavior. App-level smoke checks
Humanly's own register/settings/document/upload/shortcut/chat chain.
`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
  process.exit(0);
}

const execute = boolArg("execute", "QA_AI_EXECUTE", false);
const providerName = arg("provider", process.env.QA_AI_PROVIDER || "together");
const provider = PROVIDERS[providerName];
const model = arg("model", process.env.QA_AI_MODEL);
const models =
  parseList(arg("models", process.env.QA_AI_MODELS)) || (model ? [model] : []);
const baseUrl = arg(
  "base-url",
  process.env.QA_AI_BASE_URL || provider?.baseUrl,
);
const manifestPath = arg(
  "manifest",
  process.env.QA_AI_MANIFEST || "fixtures/qa/ai-usage/manifest.json",
);
const apiKey =
  process.env.QA_AI_API_KEY ||
  (provider ? process.env[provider.keyEnv] : undefined);
const documentFilter = parseSet(arg("documents", process.env.QA_AI_DOCUMENTS));
const queryTypeFilter = parseSet(
  arg("query-types", process.env.QA_AI_QUERY_TYPES),
);
const shortcutMaxTokens = intArg(
  "shortcut-max-tokens",
  "QA_AI_SHORTCUT_MAX_TOKENS",
  1024,
);
const chatMaxTokens = intArg("chat-max-tokens", "QA_AI_CHAT_MAX_TOKENS", 4096);
const disableReasoning = boolArg(
  "disable-reasoning",
  "QA_AI_DISABLE_REASONING",
  false,
);
const imageExecute = boolArg("image-execute", "QA_AI_IMAGE_EXECUTE", false);
const imageModels =
  parseList(arg("image-models", process.env.QA_AI_IMAGE_MODELS)) || models;
const appExecute = boolArg("app-execute", "QA_AI_APP_EXECUTE", false);
const appBaseUrl = normalizeApiBaseUrl(
  arg("app-base-url", process.env.QA_AI_APP_BASE_URL),
  DEFAULT_APP_BASE_URL,
);
const appProviderBaseUrl = arg(
  "app-provider-base-url",
  process.env.QA_AI_APP_PROVIDER_BASE_URL || baseUrl,
);
const appModel = arg(
  "app-model",
  process.env.QA_AI_APP_MODEL || models[0] || model,
);
const appApiKey = process.env.QA_AI_APP_API_KEY || apiKey;
const appKeepData = boolArg("app-keep-data", "QA_AI_APP_KEEP_DATA", false);
const appRequireToolCall = boolArg(
  "app-require-tool-call",
  "QA_AI_APP_REQUIRE_TOOL_CALL",
  true,
);
const appEmail =
  arg("app-email", process.env.QA_AI_APP_EMAIL) ||
  `ai-usage-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@example.com`;
const appLoginValue = arg(
  "app-password",
  process.env.QA_AI_APP_PASSWORD || makeQaLoginValue(),
);

const PSEUDO_TOOL_MARKUP =
  /(<\s*tool_(?:call|use)s?\b|<\s*function\b|<\s*parameter\b|<[^>]*DSML|tool_calls>|<\/[^>]*invoke>|"function"\s*:\s*"[^"]+"\s*,\s*"arguments")/i;
const EMPTY_FINAL_PATTERNS = [
  /could not produce a final answer/i,
  /couldn'?t produce a final answer/i,
  /could not complete retrieval/i,
  /can only read reference files/i,
  /use the selection-menu quick action/i,
];

function parseList(value) {
  const parsed = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : null;
}

function parseSet(value) {
  const parsed = parseList(value);
  return parsed ? new Set(parsed) : null;
}

function selected(items, filter) {
  if (!filter) return items || [];
  return (items || []).filter((item) => filter.has(item.id));
}

function expandMatrix(manifest, modelIds) {
  const documents = selected(manifest.documents, documentFilter);
  const queryTypes = selected(manifest.queryTypes, queryTypeFilter);
  const effectiveModels =
    modelIds.length > 0
      ? modelIds
      : (manifest.modelGroups || []).flatMap((group) => group.examples || []);
  return effectiveModels.flatMap((modelId) =>
    documents.flatMap((document) =>
      queryTypes.map((queryType) => ({
        model: modelId,
        document: document.id,
        queryType: queryType.id,
      })),
    ),
  );
}

function providerDisableReasoningParams() {
  if (!disableReasoning) return {};
  if (providerName === "openrouter") {
    return { reasoning: { effort: "none" } };
  }
  if (providerName === "together") {
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  return {};
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function makeSolidRedPngDataUrl() {
  const width = 24;
  const height = 24;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 3;
      row[offset] = 255;
      row[offset + 1] = 0;
      row[offset + 2] = 0;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

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

async function makeAppPdfBuffer(runId) {
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
    doc.fontSize(18).text("Humanly AI Usage QA Fixture", { underline: true });
    doc.moveDown();
    doc
      .fontSize(11)
      .text(`Run ${runId} validates Humanly app-level AI retrieval.`);
    doc.moveDown();
    doc.text(`The retrieval marker is ${appReferenceMarker}.`);
    doc.text(
      "The answer must be grounded in this uploaded PDF, not guessed from the user prompt alone.",
    );
    doc.end();
  });
}

function authHeaders(accessToken, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  };
}

async function fetchAuthedJson(pathname, accessToken, options = {}) {
  return fetchJson(joinUrl(appBaseUrl, pathname), {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(accessToken),
      ...(options.headers || {}),
    },
  });
}

function extractMessageContent(body) {
  return String(body?.data?.message?.content || "");
}

function extractToolCalls(body) {
  const metadata = body?.data?.message?.metadata || {};
  return Array.isArray(metadata.toolCalls) ? metadata.toolCalls : [];
}

const report = createQaRun({
  layer: "ai-usage",
  title: "AI Usage Harness",
  config: {
    execute,
    provider: providerName,
    models,
    baseUrl,
    manifestPath,
    hasApiKey: Boolean(apiKey),
    documentFilter: documentFilter ? [...documentFilter] : undefined,
    queryTypeFilter: queryTypeFilter ? [...queryTypeFilter] : undefined,
    shortcutMaxTokens,
    chatMaxTokens,
    imageExecute,
    imageModels,
    appExecute,
    appBaseUrl,
    appProviderBaseUrl,
    appModel,
    appKeepData,
    appRequireToolCall,
    hasAppApiKey: Boolean(appApiKey),
    appEmail: appExecute ? appEmail : undefined,
  },
});

let manifest = null;

await runCheck(
  report,
  {
    id: "manifest-load",
    title: "AI usage matrix manifest loads",
    target: manifestPath,
  },
  async () => {
    const raw = await fs.readFile(manifestPath, "utf8");
    manifest = JSON.parse(raw);
    const dimensions = {
      documents: manifest.documents?.length || 0,
      queryTypes: manifest.queryTypes?.length || 0,
      modelGroups: manifest.modelGroups?.length || 0,
      requiredSignals: manifest.requiredSignals?.length || 0,
    };
    if (
      dimensions.documents === 0 ||
      dimensions.queryTypes === 0 ||
      dimensions.requiredSignals === 0
    ) {
      throw new Error(
        "Manifest must include documents, queryTypes, and requiredSignals.",
      );
    }
    return { details: dimensions };
  },
);

await runCheck(
  report,
  {
    id: "matrix-plan",
    title: "Humanly AI usage matrix can be expanded",
    target: manifestPath,
  },
  async () => {
    if (!manifest) {
      throw new Error("Manifest was not loaded.");
    }
    const rows = expandMatrix(manifest, models);
    if (rows.length === 0) {
      throw new Error("Matrix expansion produced zero rows.");
    }
    const byDocument = {};
    const byQueryType = {};
    const byModel = {};
    for (const row of rows) {
      byDocument[row.document] = (byDocument[row.document] || 0) + 1;
      byQueryType[row.queryType] = (byQueryType[row.queryType] || 0) + 1;
      byModel[row.model] = (byModel[row.model] || 0) + 1;
    }
    return {
      details: {
        rows: rows.length,
        modelCount: Object.keys(byModel).length,
        documentCount: Object.keys(byDocument).length,
        queryTypeCount: Object.keys(byQueryType).length,
        sampleRows: rows.slice(0, 8),
      },
    };
  },
);

if (!execute) {
  addCheck(report, {
    id: "provider-smoke",
    title: "Live provider text/tool smoke",
    target: providerName,
    status: "skip",
    details: {
      reason:
        "Set QA_AI_EXECUTE=1 plus provider/model/key env to run live checks.",
    },
  });
} else {
  if (!provider && !baseUrl) {
    addCheck(report, {
      id: "provider-config",
      title: "Provider configuration is supported",
      target: providerName,
      status: "fail",
      critical: true,
      error: `Unknown provider ${providerName}; pass --base-url for a custom OpenAI-compatible endpoint.`,
    });
  } else if (models.length === 0 || !apiKey || !baseUrl) {
    addCheck(report, {
      id: "provider-config",
      title: "Provider credentials are present",
      target: providerName,
      status: "fail",
      critical: true,
      details: {
        modelCount: models.length,
        hasApiKey: Boolean(apiKey),
        hasBaseUrl: Boolean(baseUrl),
      },
    });
  } else {
    for (const modelId of models) {
      await runCheck(
        report,
        {
          id: `provider-text:${modelId}`,
          title: "Live provider returns bounded text without tool markup leaks",
          target: `${providerName}:${modelId}`,
        },
        async () => {
          const { response, body } = await fetchJson(
            joinUrl(baseUrl, "/chat/completions"),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                ...(provider?.extraHeaders || {}),
              },
              body: JSON.stringify({
                model: modelId,
                messages: [
                  {
                    role: "user",
                    content:
                      "Reply with exactly one short sentence confirming that this is a Humanly QA smoke test.",
                  },
                ],
                max_tokens: shortcutMaxTokens,
                temperature: 0,
                ...providerDisableReasoningParams(),
              }),
            },
          );
          const message = body?.choices?.[0]?.message || {};
          const content = String(message.content || "");
          const reasoning =
            message.reasoning || message.reasoning_content || "";
          if (response.status !== 200 || !content.trim()) {
            const finishReason =
              body?.choices?.[0]?.finish_reason ||
              body?.choices?.[0]?.native_finish_reason;
            const reasoningTokens =
              body?.usage?.completion_tokens_details?.reasoning_tokens;
            throw new Error(
              `Expected non-empty completion, got ${response.status}; finish=${finishReason || "unknown"}; reasoningTokens=${reasoningTokens ?? "unknown"}; shortcutMaxTokens=${shortcutMaxTokens}`,
            );
          }
          if (PSEUDO_TOOL_MARKUP.test(content)) {
            throw new Error("Text response leaked pseudo-tool markup.");
          }
          return {
            details: {
              status: response.status,
              contentPreview: content.trim().slice(0, 160),
              hasReasoning: Boolean(reasoning),
              disableReasoning,
            },
          };
        },
      );

      await runCheck(
        report,
        {
          id: `provider-tool:${modelId}`,
          title: "Live provider accepts OpenAI-compatible tool schema",
          target: `${providerName}:${modelId}`,
        },
        async () => {
          const { response, body } = await fetchJson(
            joinUrl(baseUrl, "/chat/completions"),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                ...(provider?.extraHeaders || {}),
              },
              body: JSON.stringify({
                model: modelId,
                messages: [
                  {
                    role: "user",
                    content: "Use the tool to report the word humanly.",
                  },
                ],
                tools: [
                  {
                    type: "function",
                    function: {
                      name: "report_word",
                      description:
                        "Report one requested word for provider tool-call compatibility smoke tests.",
                      parameters: {
                        type: "object",
                        properties: {
                          word: { type: "string" },
                        },
                        required: ["word"],
                      },
                    },
                  },
                ],
                tool_choice: "auto",
                max_tokens: chatMaxTokens,
                temperature: 0,
              }),
            },
          );
          const message = body?.choices?.[0]?.message || {};
          const toolCalls = message.tool_calls || [];
          const content = String(message.content || "");
          if (response.status !== 200 || toolCalls.length === 0) {
            throw new Error(
              `Expected at least one tool call, got ${response.status}`,
            );
          }
          if (PSEUDO_TOOL_MARKUP.test(content)) {
            throw new Error("Tool response content leaked pseudo-tool markup.");
          }
          return {
            details: {
              status: response.status,
              toolCallCount: toolCalls.length,
              firstToolName: toolCalls[0]?.function?.name || null,
              contentPreview: content.trim().slice(0, 160),
            },
          };
        },
      );
    }

    if (!imageExecute) {
      addCheck(report, {
        id: "provider-image-smoke",
        title: "Live provider image-input smoke",
        target: providerName,
        status: "skip",
        details: {
          reason:
            "Set QA_AI_IMAGE_EXECUTE=1 plus image-capable model ids to run provider image checks.",
        },
      });
    } else if (imageModels.length === 0) {
      addCheck(report, {
        id: "provider-image-config",
        title: "Provider image-input model list is present",
        target: providerName,
        status: "fail",
        critical: true,
        details: {
          modelCount: imageModels.length,
        },
      });
    } else {
      const redSquareDataUrl = makeSolidRedPngDataUrl();
      for (const modelId of imageModels) {
        await runCheck(
          report,
          {
            id: `provider-image:${modelId}`,
            title: "Live provider accepts OpenAI-compatible image input",
            target: `${providerName}:${modelId}`,
          },
          async () => {
            const { response, body } = await fetchJson(
              joinUrl(baseUrl, "/chat/completions"),
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  ...(provider?.extraHeaders || {}),
                },
                body: JSON.stringify({
                  model: modelId,
                  messages: [
                    {
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text: "The image is a solid color square. Reply with exactly the color name.",
                        },
                        {
                          type: "image_url",
                          image_url: { url: redSquareDataUrl },
                        },
                      ],
                    },
                  ],
                  max_tokens: shortcutMaxTokens,
                  temperature: 0,
                  ...providerDisableReasoningParams(),
                }),
              },
            );
            const message = body?.choices?.[0]?.message || {};
            const content = String(message.content || "");
            if (response.status !== 200 || !content.trim()) {
              throw new Error(
                `Expected non-empty image response, got ${response.status}`,
              );
            }
            if (!/red/i.test(content)) {
              throw new Error(
                `Expected image response to identify red square, got: ${content.slice(0, 120)}`,
              );
            }
            if (PSEUDO_TOOL_MARKUP.test(content)) {
              throw new Error("Image response leaked pseudo-tool markup.");
            }
            return {
              details: {
                status: response.status,
                contentPreview: content.trim().slice(0, 160),
                disableReasoning,
              },
            };
          },
        );
      }
    }
  }
}

if (!appExecute) {
  addCheck(report, {
    id: "humanly-app-smoke",
    title: "Humanly app-level AI smoke",
    target: appBaseUrl,
    status: "skip",
    details: {
      reason:
        "Set QA_AI_APP_EXECUTE=1 plus provider model/base/key env to run Humanly app-level AI checks.",
    },
  });
} else if (!appModel || !appProviderBaseUrl || !appApiKey) {
  addCheck(report, {
    id: "humanly-app-config",
    title: "Humanly app-level AI configuration is present",
    target: appBaseUrl,
    status: "fail",
    critical: true,
    details: {
      hasModel: Boolean(appModel),
      hasProviderBaseUrl: Boolean(appProviderBaseUrl),
      hasApiKey: Boolean(appApiKey),
    },
  });
} else {
  let accessToken = null;
  let documentId = null;
  let fileId = null;
  let sessionId = null;
  let aiSettingsSaved = false;

  await runCheck(
    report,
    {
      id: "humanly-app-register",
      title: "Humanly app smoke registers a transient user",
      target: joinUrl(appBaseUrl, "/auth/register"),
    },
    async () => {
      const { response, body } = await fetchJson(
        joinUrl(appBaseUrl, "/auth/register"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: appEmail,
            password: appLoginValue,
            role: "user",
          }),
        },
      );
      if (![200, 201, 409].includes(response.status)) {
        throw new Error(
          `Expected registration success/existing user, got ${response.status}`,
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
      id: "humanly-app-login",
      title: "Humanly app smoke logs in the transient user",
      target: joinUrl(appBaseUrl, "/auth/login"),
    },
    async () => {
      const { response, body } = await fetchJson(
        joinUrl(appBaseUrl, "/auth/login"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: appEmail,
            password: appLoginValue,
            role: "user",
          }),
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

  await runCheck(
    report,
    {
      id: "humanly-app-ai-settings",
      title: "Humanly app smoke saves AI settings with shortcut/chat budgets",
      target: joinUrl(appBaseUrl, "/ai/settings"),
    },
    async () => {
      const { response, body } = await fetchAuthedJson(
        "/ai/settings",
        accessToken,
        {
          method: "PUT",
          body: JSON.stringify({
            apiKey: appApiKey,
            baseUrl: appProviderBaseUrl,
            model: appModel,
            shortcutMaxTokens,
            chatMaxTokens,
          }),
        },
      );
      if (response.status !== 200 || body?.success !== true) {
        throw new Error(
          `Expected AI settings save success, got ${response.status}`,
        );
      }
      aiSettingsSaved = true;
      return {
        details: {
          status: response.status,
          model: appModel,
          providerBaseUrl: appProviderBaseUrl,
          shortcutMaxTokens,
          chatMaxTokens,
        },
      };
    },
  );

  await runCheck(
    report,
    {
      id: "humanly-app-document-create",
      title: "Humanly app smoke creates an AI-enabled document",
      target: joinUrl(appBaseUrl, "/documents"),
    },
    async () => {
      const { response, body } = await fetchAuthedJson(
        "/documents",
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            title: `QA AI Usage ${report.run.id}`,
            description: "Generated by qa:ai:usage app-level smoke.",
            content: makeLexicalContent(
              "This document exists for Humanly AI usage smoke testing.",
            ),
            status: "draft",
            environmentConfig: {
              taskType: "personal",
              instructions: {
                hasInstructionPdf: false,
                editableAfterSubmission: true,
              },
              aiAccess: "full",
              allowedModels: [appModel],
              customModels: [],
              aiTokenBudget: {
                shortcutMaxTokens,
                chatMaxTokens,
              },
              aiUsageLimit: { mode: "unlimited" },
              time: { lateSubmission: "allowed" },
              submission: { mode: "multiple" },
              traceability: {
                trackAiUsage: true,
                trackTyping: true,
                trackCopyPaste: true,
                trackFocusBlur: true,
              },
              copyPastePolicy: "allowed",
            },
          }),
        },
      );
      documentId = body?.data?.document?.id || null;
      if (response.status !== 201 || !documentId) {
        throw new Error(`Expected created document, got ${response.status}`);
      }
      return { details: { status: response.status, documentId } };
    },
  );

  if (documentId) {
    await runCheck(
      report,
      {
        id: "humanly-app-upload-pdf",
        title: "Humanly app smoke uploads a retrieval PDF",
        target: joinUrl(appBaseUrl, `/documents/${documentId}/files`),
      },
      async () => {
        const pdfBuffer = await makeAppPdfBuffer(report.run.id);
        const form = new FormData();
        form.append("title", "QA AI Usage Retrieval PDF");
        form.append(
          "pdf",
          new Blob([pdfBuffer], { type: "application/pdf" }),
          "qa-ai-usage.pdf",
        );
        const { response, body } = await fetchJson(
          joinUrl(appBaseUrl, `/documents/${documentId}/files`),
          {
            method: "POST",
            headers: authHeaders(accessToken),
            body: form,
          },
        );
        fileId = body?.data?.id || body?.data?.file?.id || null;
        if (![200, 201].includes(response.status)) {
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
        id: "humanly-app-shortcut",
        title: "Humanly app shortcut path returns clean selected-text output",
        target: joinUrl(appBaseUrl, "/ai/chat"),
      },
      async () => {
        const originalText = "this sentence need better grammar";
        const { response, body } = await fetchAuthedJson(
          "/ai/chat",
          accessToken,
          {
            method: "POST",
            body: JSON.stringify({
              documentId,
              silent: true,
              message: "Fix the grammar of the selected text.",
              context: {
                selectedText: originalText,
                selection: { text: originalText },
              },
            }),
          },
        );
        const content = extractMessageContent(body);
        if (response.status !== 200 || !content.trim()) {
          throw new Error(`Expected shortcut content, got ${response.status}`);
        }
        if (PSEUDO_TOOL_MARKUP.test(content)) {
          throw new Error("Shortcut response leaked pseudo-tool markup.");
        }
        if (EMPTY_FINAL_PATTERNS.some((pattern) => pattern.test(content))) {
          throw new Error(
            "Shortcut response returned an empty/fallback final-answer message.",
          );
        }
        return {
          details: {
            status: response.status,
            contentPreview: content.trim().slice(0, 200),
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "humanly-app-chat-retrieval",
        title: "Humanly app chat retrieves uploaded PDF evidence",
        target: joinUrl(appBaseUrl, "/ai/chat"),
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          "/ai/chat",
          accessToken,
          {
            method: "POST",
            body: JSON.stringify({
              documentId,
              message:
                "Use the uploaded reference PDF. What is the retrieval marker?",
              context: {},
            }),
          },
        );
        const content = extractMessageContent(body);
        const toolCalls = extractToolCalls(body);
        sessionId = body?.data?.sessionId || null;
        if (response.status !== 200 || !content.trim()) {
          throw new Error(`Expected chat content, got ${response.status}`);
        }
        if (PSEUDO_TOOL_MARKUP.test(content)) {
          throw new Error("Chat response leaked pseudo-tool markup.");
        }
        if (EMPTY_FINAL_PATTERNS.some((pattern) => pattern.test(content))) {
          throw new Error(
            "Chat response returned an empty/fallback final-answer message.",
          );
        }
        if (!content.toLowerCase().includes(appReferenceMarker)) {
          throw new Error(`Expected answer to include ${appReferenceMarker}.`);
        }
        if (toolCalls.length === 0) {
          if (appRequireToolCall) {
            throw new Error(
              "Expected persisted tool-call trace on app chat response.",
            );
          }
          return {
            status: "warn",
            details: {
              status: response.status,
              sessionId,
              toolCallCount: 0,
              contentPreview: content.trim().slice(0, 240),
            },
          };
        }
        return {
          details: {
            status: response.status,
            sessionId,
            toolCallCount: toolCalls.length,
            toolNames: toolCalls
              .map((toolCall) => toolCall.toolName)
              .filter(Boolean),
            contentPreview: content.trim().slice(0, 240),
          },
        };
      },
    );

    await runCheck(
      report,
      {
        id: "humanly-app-sessions-read",
        title: "Humanly app smoke can re-read chat session metadata",
        target: joinUrl(appBaseUrl, `/ai/sessions/${documentId}`),
        critical: false,
      },
      async () => {
        const { response, body } = await fetchAuthedJson(
          `/ai/sessions/${documentId}`,
          accessToken,
        );
        const sessions = body?.data?.sessions || body?.data || [];
        const found =
          Array.isArray(sessions) &&
          sessions.some((session) => session.id === sessionId);
        if (response.status !== 200 || !found) {
          throw new Error(
            `Expected sessions list to include ${sessionId || "created session"}, got ${response.status}`,
          );
        }
        return {
          details: {
            status: response.status,
            sessionId,
            sessionCount: sessions.length,
          },
        };
      },
    );
  } else {
    addCheck(report, {
      id: "humanly-app-document-dependent-probes",
      title: "Humanly app document upload, shortcut, chat, and session probes",
      target: joinUrl(appBaseUrl, "/documents/:id"),
      status: "skip",
      details: {
        reason:
          "Skipped because document creation did not establish the required precondition.",
      },
    });
  }

  if (!appKeepData && (documentId || aiSettingsSaved)) {
    await runCheck(
      report,
      {
        id: "humanly-app-cleanup",
        title: "Humanly app smoke deletes created document and AI settings",
        target: documentId
          ? joinUrl(appBaseUrl, `/documents/${documentId}`)
          : joinUrl(appBaseUrl, "/ai/settings"),
        critical: false,
      },
      async () => {
        const documentDelete = documentId
          ? await fetchAuthedJson(`/documents/${documentId}`, accessToken, {
              method: "DELETE",
            })
          : null;
        const settingsDelete = aiSettingsSaved
          ? await fetchAuthedJson("/ai/settings", accessToken, {
              method: "DELETE",
            })
          : null;
        if (
          documentDelete &&
          ![200, 404].includes(documentDelete.response.status)
        ) {
          throw new Error(
            `Expected document cleanup success, got ${documentDelete.response.status}`,
          );
        }
        if (
          settingsDelete &&
          ![200, 404].includes(settingsDelete.response.status)
        ) {
          throw new Error(
            `Expected settings cleanup success, got ${settingsDelete.response.status}`,
          );
        }
        return {
          details: {
            documentDeleteStatus: documentDelete?.response.status || "skipped",
            settingsDeleteStatus: settingsDelete?.response.status || "skipped",
          },
        };
      },
    );
  } else if (appKeepData) {
    addCheck(report, {
      id: "humanly-app-cleanup",
      title: "Humanly app smoke cleanup",
      target: documentId
        ? joinUrl(appBaseUrl, `/documents/${documentId}`)
        : "/documents/:id",
      status: "skip",
      details: {
        reason: "QA_AI_APP_KEEP_DATA=1 was set.",
        documentId,
        fileId,
        sessionId,
        appEmail,
      },
    });
  }
}

await writeReport(report);
printReportLocation(report);
exitForReport(report);
