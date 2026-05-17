#!/usr/bin/env node
/**
 * Backend stress and fixture harness for Humanly.
 *
 * Safe defaults target local dev. Remote/prod targets are automatically capped
 * unless STRESS_ALLOW_REMOTE=1 is set.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(
  fileURLToPath(new URL('../packages/backend/package.json', import.meta.url)),
);
const PDFDocument = require('pdfkit');

const DEFAULT_BASE_URL = 'http://localhost:3001/api/v1';
const DEFAULT_PASSWORD = 'StressTestPassw0rd!';

function arg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return fallback;
}

function boolArg(name, envName, fallback = false) {
  const value = arg(name, process.env[envName]);
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function intArg(name, envName, fallback) {
  const value = arg(name, process.env[envName]);
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function showHelp() {
  console.log(`Humanly backend stress harness

Usage:
  pnpm qa:stress:backend -- --base-url=http://localhost:3001/api/v1

Environment / flags:
  STRESS_BASE_URL / --base-url       API base URL, with or without /api/v1
  STRESS_EMAIL / --email             Existing or generated QA user email
  STRESS_PASSWORD / --password       QA user password
  STRESS_ACCESS_TOKEN                Use an existing bearer token; skips auth
  STRESS_EXISTING_USER=1             Skip register and only login
  STRESS_ROUNDS / --rounds           Documents to create (default 4)
  STRESS_CONCURRENCY / --concurrency Concurrent request workers (default 3)
  STRESS_EVENT_BATCH_SIZE            Events per batch (default 200)
  STRESS_EVENT_BATCHES               Event batches per document (default 2)
  STRESS_LONG_TEXT_KB                Approx text size per document (default 32)
  STRESS_PDF_PAGES                   Synthetic PDF pages (default 5)
  STRESS_OUTPUT_DIR                  Report directory (default tmp/stress-runs/<id>)
  STRESS_ALLOW_REMOTE=1              Allow uncapped remote/prod intensity
  STRESS_SKIP_UPLOADS=1              Skip PDF and unsupported-format upload probes
  STRESS_CLEANUP=1                   Delete created documents at the end

Outputs:
  report.json and report.md under STRESS_OUTPUT_DIR.
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

function normalizeBaseUrl(rawBaseUrl) {
  const url = new URL(rawBaseUrl || DEFAULT_BASE_URL);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/api/v1')) {
    url.pathname = `${url.pathname}/api/v1`.replace(/\/+/g, '/');
  }
  return url.toString().replace(/\/$/, '');
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const baseUrl = normalizeBaseUrl(arg('base-url', process.env.STRESS_BASE_URL || DEFAULT_BASE_URL));
const baseOrigin = new URL(baseUrl).origin;
const isLocalTarget = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(new URL(baseUrl).host);
const allowRemote = boolArg('allow-remote', 'STRESS_ALLOW_REMOTE', false);

let rounds = intArg('rounds', 'STRESS_ROUNDS', 4);
let concurrency = intArg('concurrency', 'STRESS_CONCURRENCY', 3);
let eventBatchSize = intArg('event-batch-size', 'STRESS_EVENT_BATCH_SIZE', 200);
let eventBatches = intArg('event-batches', 'STRESS_EVENT_BATCHES', 2);
let longTextKb = intArg('long-text-kb', 'STRESS_LONG_TEXT_KB', 32);
let pdfPages = intArg('pdf-pages', 'STRESS_PDF_PAGES', 5);

const safetyNotes = [];
if (!isLocalTarget && !allowRemote) {
  const before = { rounds, concurrency, eventBatchSize, eventBatches, longTextKb, pdfPages };
  rounds = Math.min(rounds, 2);
  concurrency = Math.min(concurrency, 2);
  eventBatchSize = Math.min(eventBatchSize, 100);
  eventBatches = Math.min(eventBatches, 1);
  longTextKb = Math.min(longTextKb, 16);
  pdfPages = Math.min(pdfPages, 3);
  safetyNotes.push({
    type: 'remote-cap',
    message: 'Remote target detected without STRESS_ALLOW_REMOTE=1; intensity was capped.',
    before,
    after: { rounds, concurrency, eventBatchSize, eventBatches, longTextKb, pdfPages },
  });
}

const email =
  arg('email', process.env.STRESS_EMAIL) ||
  `stress-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@example.com`;
const password = arg('password', process.env.STRESS_PASSWORD || DEFAULT_PASSWORD);
const accessTokenOverride = process.env.STRESS_ACCESS_TOKEN;
const existingUser = boolArg('existing-user', 'STRESS_EXISTING_USER', false);
const skipUploads = boolArg('skip-uploads', 'STRESS_SKIP_UPLOADS', false);
const cleanup = boolArg('cleanup', 'STRESS_CLEANUP', false);
const outputDir = path.resolve(
  arg('output-dir', process.env.STRESS_OUTPUT_DIR || path.join('tmp', 'stress-runs', runId)),
);

const metrics = [];
const failures = [];
const createdDocumentIds = [];
const deletedDocumentIds = [];
const uploadedFileIds = [];
let accessToken = accessTokenOverride || null;

function urlFor(pathname) {
  return `${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarizeMetrics() {
  const durations = metrics.map((m) => m.durationMs);
  const byStatus = {};
  const byName = {};
  for (const metric of metrics) {
    byStatus[metric.status] = (byStatus[metric.status] || 0) + 1;
    byName[metric.name] ||= { count: 0, failures: 0, durations: [] };
    byName[metric.name].count += 1;
    byName[metric.name].durations.push(metric.durationMs);
    if (!metric.ok) byName[metric.name].failures += 1;
  }

  const phaseSummary = Object.fromEntries(
    Object.entries(byName).map(([name, value]) => [
      name,
      {
        count: value.count,
        failures: value.failures,
        p50Ms: Math.round(percentile(value.durations, 50)),
        p95Ms: Math.round(percentile(value.durations, 95)),
        maxMs: Math.round(Math.max(...value.durations)),
      },
    ]),
  );

  return {
    requests: metrics.length,
    failures: failures.length,
    byStatus,
    p50Ms: Math.round(percentile(durations, 50)),
    p95Ms: Math.round(percentile(durations, 95)),
    p99Ms: Math.round(percentile(durations, 99)),
    maxMs: durations.length ? Math.round(Math.max(...durations)) : 0,
    phases: phaseSummary,
  };
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

async function requestJson(name, pathname, options = {}) {
  const started = performance.now();
  const expectedStatuses = options.expectedStatuses || [200, 201];
  const headers = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  let body;
  let ok = false;
  try {
    response = await fetch(urlFor(pathname), {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    body = await readBody(response);
    ok = expectedStatuses.includes(response.status);
    return { response, body, ok };
  } catch (error) {
    body = { error: error instanceof Error ? error.message : String(error) };
    throw error;
  } finally {
    const durationMs = performance.now() - started;
    const metric = {
      name,
      method: options.method || 'GET',
      path: pathname,
      status: response?.status || 'network-error',
      ok,
      durationMs,
    };
    metrics.push(metric);
    if (!ok) {
      failures.push({
        ...metric,
        body,
      });
    }
  }
}

async function requestForm(name, pathname, formData, expectedStatuses = [200, 201]) {
  const started = performance.now();
  let response;
  let body;
  let ok = false;
  try {
    response = await fetch(urlFor(pathname), {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: formData,
    });
    body = await readBody(response);
    ok = expectedStatuses.includes(response.status);
    return { response, body, ok };
  } catch (error) {
    body = { error: error instanceof Error ? error.message : String(error) };
    throw error;
  } finally {
    const durationMs = performance.now() - started;
    const metric = {
      name,
      method: 'POST',
      path: pathname,
      status: response?.status || 'network-error',
      ok,
      durationMs,
    };
    metrics.push(metric);
    if (!ok) {
      failures.push({
        ...metric,
        body,
      });
    }
  }
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function makeLongText(targetKb, seed) {
  const paragraph =
    `Humanly stress fixture ${seed}: this paragraph records provenance, AI usage policy, keystroke events, ` +
    'document statistics, certificate generation, retrieval grounding, and backend latency behavior. ';
  const targetBytes = targetKb * 1024;
  let text = '';
  while (Buffer.byteLength(text, 'utf8') < targetBytes) {
    text += `${paragraph}Segment ${text.length}. `;
  }
  return text;
}

function makeLexicalContent(text) {
  const paragraphs = text.match(/.{1,900}(?:\s|$)/g) || [text];
  return {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: paragraphs.map((paragraph) => ({
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: [
          {
            type: 'text',
            version: 1,
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: paragraph.trim(),
          },
        ],
      })),
    },
  };
}

function makeEvents(documentId, count, seed) {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => ({
    eventType: index % 5 === 0 ? 'input' : 'keydown',
    timestamp: new Date(now + index).toISOString(),
    keyCode: index % 5 === 0 ? undefined : `Key${String.fromCharCode(65 + (index % 26))}`,
    keyChar: String.fromCharCode(97 + (index % 26)),
    cursorPosition: index,
    selectionStart: index,
    selectionEnd: index,
    textBefore: `doc=${documentId} seed=${seed} before ${index}`,
    textAfter: `doc=${documentId} seed=${seed} after ${index}`,
    metadata: {
      stressRun: runId,
      batchSeed: seed,
      index,
    },
  }));
}

async function makePdfBuffer(pageCount, seed) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, size: 'LETTER', margin: 48 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    for (let page = 1; page <= pageCount; page += 1) {
      doc.addPage();
      doc.fontSize(18).text(`Humanly Stress PDF ${seed}`, { underline: true });
      doc.moveDown();
      doc.fontSize(11);
      for (let line = 0; line < 32; line += 1) {
        doc.text(
          `Page ${page}, line ${line + 1}: synthetic reference text for retrieval, upload, indexing, and stream pressure tests. Keyword stress-${seed}-${page}-${line}.`,
        );
      }
    }
    doc.end();
  });
}

async function authenticate() {
  if (accessToken) {
    await requestJson('auth.me-with-token', '/auth/me');
    return;
  }

  if (!existingUser) {
    await requestJson('auth.register', '/auth/register', {
      method: 'POST',
      body: { email, password, role: 'user' },
      expectedStatuses: [201, 409, 429],
    });
  }

  const login = await requestJson('auth.login', '/auth/login', {
    method: 'POST',
    body: { email, password, role: 'user' },
    expectedStatuses: [200],
  });
  accessToken = login.body?.data?.accessToken;
  if (!accessToken) {
    throw new Error('Login did not return an access token. Use STRESS_ACCESS_TOKEN or valid STRESS_EMAIL/STRESS_PASSWORD.');
  }
}

async function createDocuments() {
  const seeds = Array.from({ length: rounds }, (_, index) => index + 1);
  await mapConcurrent(seeds, concurrency, async (seed) => {
    const text = makeLongText(longTextKb, seed);
    const created = await requestJson('documents.create', '/documents', {
      method: 'POST',
      body: {
        title: `Stress Document ${runId} #${seed}`,
        description: `Generated by backend-stress-test ${runId}`,
        content: makeLexicalContent(text),
        status: 'draft',
      },
    });
    const documentId = created.body?.data?.document?.id;
    if (documentId) createdDocumentIds.push(documentId);
    return documentId;
  });
}

async function updateDocuments() {
  await mapConcurrent(createdDocumentIds, concurrency, async (documentId, index) => {
    const text = makeLongText(Math.max(4, Math.floor(longTextKb / 2)), `update-${index}`);
    await requestJson('documents.update', `/documents/${documentId}`, {
      method: 'PUT',
      body: {
        content: makeLexicalContent(text),
        status: 'draft',
      },
    });
  });
}

async function postEvents() {
  const batches = [];
  for (const documentId of createdDocumentIds) {
    for (let batch = 0; batch < eventBatches; batch += 1) {
      batches.push({ documentId, batch });
    }
  }

  await mapConcurrent(batches, concurrency, async ({ documentId, batch }) => {
    await requestJson('documents.events.post', `/documents/${documentId}/events`, {
      method: 'POST',
      body: {
        events: makeEvents(documentId, eventBatchSize, batch),
      },
    });
  });
}

async function queryDocuments() {
  const probes = [];
  for (const documentId of createdDocumentIds) {
    probes.push(['documents.get', `/documents/${documentId}`]);
    probes.push(['documents.events.get', `/documents/${documentId}/events?limit=50&offset=0`]);
    probes.push(['documents.stats', `/documents/${documentId}/stats`]);
  }
  probes.push(['documents.list', `/documents?limit=50&search=${encodeURIComponent(runId)}`]);

  await mapConcurrent(probes, concurrency, async ([name, pathname]) => {
    await requestJson(name, pathname);
  });
}

async function uploadPdfFixtures() {
  if (skipUploads || createdDocumentIds.length === 0) return;

  const pdfBuffer = await makePdfBuffer(pdfPages, runId);
  await mapConcurrent(createdDocumentIds.slice(0, Math.min(2, createdDocumentIds.length)), 1, async (documentId, index) => {
    const form = new FormData();
    form.append('title', `Stress PDF ${index + 1}`);
    form.append('pdf', new Blob([pdfBuffer], { type: 'application/pdf' }), `stress-${index + 1}.pdf`);
    const uploaded = await requestForm('files.upload.pdf', `/documents/${documentId}/files`, form);
    const fileId = uploaded.body?.data?.id;
    if (fileId) uploadedFileIds.push(fileId);
  });

  await mapConcurrent(uploadedFileIds, concurrency, async (fileId) => {
    await requestJson('files.stream.pdf', `/files/${fileId}/content`);
  });
}

async function probeUnsupportedFormats() {
  if (skipUploads || createdDocumentIds.length === 0) return;

  const probes = [
    {
      name: 'unsupported.docx',
      filename: 'stress.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: 'PK fake docx payload',
    },
    {
      name: 'unsupported.md',
      filename: 'stress.md',
      type: 'text/markdown',
      body: '# Humanly stress markdown\n\nThis is intentionally unsupported today.',
    },
    {
      name: 'unsupported.pptx',
      filename: 'stress.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      body: 'PK fake pptx payload',
    },
  ];

  const documentId = createdDocumentIds[0];
  await mapConcurrent(probes, 1, async (probe) => {
    const form = new FormData();
    form.append('title', probe.filename);
    form.append('pdf', new Blob([probe.body], { type: probe.type }), probe.filename);
    await requestForm(`files.upload.${probe.name}`, `/documents/${documentId}/files`, form, [400]);
  });
}

async function cleanupDocuments() {
  if (!cleanup || createdDocumentIds.length === 0) return;

  await mapConcurrent(createdDocumentIds, concurrency, async (documentId) => {
    const deleted = await requestJson('documents.delete', `/documents/${documentId}`, {
      method: 'DELETE',
      expectedStatuses: [200, 404],
    });
    if (deleted.response?.status === 200) deletedDocumentIds.push(documentId);
  });
}

function renderMarkdown(report) {
  const lines = [
    `# Backend Stress Report`,
    '',
    `- Run: \`${report.runId}\``,
    `- Base URL: \`${report.config.baseUrl}\``,
    `- Target: ${report.config.isLocalTarget ? 'local' : 'remote'}`,
    `- Requests: ${report.summary.requests}`,
    `- Failures: ${report.summary.failures}`,
    `- Latency: p50 ${report.summary.p50Ms}ms, p95 ${report.summary.p95Ms}ms, p99 ${report.summary.p99Ms}ms, max ${report.summary.maxMs}ms`,
    '',
    '## Status Counts',
    '',
    '| Status | Count |',
    '| --- | ---: |',
  ];

  for (const [status, count] of Object.entries(report.summary.byStatus)) {
    lines.push(`| ${status} | ${count} |`);
  }

  lines.push('', '## Phase Summary', '', '| Phase | Count | Failures | p50 | p95 | max |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const [phase, value] of Object.entries(report.summary.phases)) {
    lines.push(`| ${phase} | ${value.count} | ${value.failures} | ${value.p50Ms}ms | ${value.p95Ms}ms | ${value.maxMs}ms |`);
  }

  if (report.safetyNotes.length) {
    lines.push('', '## Safety Notes', '');
    for (const note of report.safetyNotes) {
      lines.push(`- ${note.message}`);
    }
  }

  if (report.failures.length) {
    lines.push('', '## Failure Samples', '');
    for (const failure of report.failures.slice(0, 10)) {
      lines.push(`- \`${failure.name}\` ${failure.method} ${failure.path} -> ${failure.status} (${Math.round(failure.durationMs)}ms)`);
    }
  }

  lines.push(
    '',
    '## File-Format Notes',
    '',
    '- PDF upload/index/stream is the currently supported document reference path.',
    '- DOCX, Markdown, and PPTX probes are expected to return 400 today; supporting them is future product work, not a stress harness requirement.',
  );

  return `${lines.join('\n')}\n`;
}

async function writeReport() {
  const report = {
    runId,
    generatedAt: new Date().toISOString(),
    config: {
      baseUrl,
      baseOrigin,
      isLocalTarget,
      allowRemote,
      email,
      rounds,
      concurrency,
      eventBatchSize,
      eventBatches,
      longTextKb,
      pdfPages,
      skipUploads,
      cleanup,
    },
    safetyNotes,
    createdDocumentIds,
    deletedDocumentIds,
    uploadedFileIds,
    summary: summarizeMetrics(),
    failures,
    metrics,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(outputDir, 'report.md'), renderMarkdown(report));
  return report;
}

async function main() {
  console.log(`Backend stress run ${runId}`);
  console.log(`Target: ${baseUrl}`);
  if (safetyNotes.length) {
    for (const note of safetyNotes) console.log(`Safety: ${note.message}`);
  }

  await requestJson('health.versioned', '/health');
  await authenticate();
  await createDocuments();
  await updateDocuments();
  await postEvents();
  await queryDocuments();
  await uploadPdfFixtures();
  await probeUnsupportedFormats();
  await cleanupDocuments();

  const report = await writeReport();
  console.log(`Report: ${path.join(outputDir, 'report.md')}`);
  console.log(
    `Summary: ${report.summary.requests} requests, ${report.summary.failures} failures, p95 ${report.summary.p95Ms}ms`,
  );

  if (report.summary.failures > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  failures.push({
    name: 'fatal',
    method: 'n/a',
    path: 'n/a',
    status: 'fatal',
    ok: false,
    durationMs: 0,
    body: error instanceof Error ? error.stack || error.message : String(error),
  });
  const report = await writeReport().catch(() => null);
  if (report) console.error(`Report: ${path.join(outputDir, 'report.md')}`);
  console.error(error);
  process.exit(1);
});
