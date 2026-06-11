#!/usr/bin/env node
/**
 * Local dev mock backend for humanly-code manual smoke tests.
 *
 * Lets Codex / any agent spin up a full visual demo without
 * Docker, without a real LLM key, and without the real Postgres /
 * TimescaleDB / Redis stack. The frontend (`@humanly/frontend-user`)
 * connects normally to http://localhost:3001 and ws://localhost:3001.
 *
 * Surface (kept tight on purpose — only what the user portal exercises):
 *   REST
 *     GET  /health
 *     GET  /api/v1/auth/me
 *     PATCH /api/v1/auth/me
 *     POST /api/v1/auth/login            (also returns the bypass token)
 *     GET  /api/v1/auth/oauth/providers
 *     POST /api/v1/dev/mock-user        (local-only fixture override)
 *     GET  /api/v1/ai/settings
 *     GET  /api/v1/documents
 *     GET  /api/v1/documents/:id
 *     GET  /api/v1/tasks/my-enrollments
 *     POST /api/v1/documents/:id/events
 *     GET  /api/v1/certificates
 *     POST /api/v1/certificates
 *     GET  /api/v1/certificates/:id
 *     GET  /api/v1/certificates/:id/ai-stats
 *     GET  /api/v1/certificates/verify/:token
 *     GET  /api/v1/certificates/verify/:token/history
 *     GET  /api/v1/ai/sessions/:documentId
 *     GET  /api/v1/ai/sessions/detail/:sessionId
 *     POST /api/v1/ai/chat              (legacy silent path; non-streaming)
 *     POST /api/v1/ai/selection-action
 *     GET  /api/v1/ai/logs
 *   Socket.IO
 *     ai:join-session     -> ai:response-complete (system handshake)
 *     ai:message (chat)   -> ai:response-start / turn-start /
 *                            thinking-delta / tool-call / tool-result /
 *                            turn-end / response-chunk* / response-complete
 *     ai:message (silent) -> ai:response-start / response-chunk* /
 *                            response-complete (sessionId="silent")
 *     ai:cancel           -> aborts any in-flight emit loop
 *
 * Run with: `pnpm dev:mock`. Stops on SIGINT.
 *
 * The mock is intentionally hard-coded; it is for SMOKE-testing visible
 * UX changes, not for correctness testing of business logic. Tests that
 * need real semantics go through unit / integration tests, not this.
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

// pnpm does not hoist socket.io to the workspace root, so resolve it via
// @humanly/backend's dependency tree (it is the canonical owner).
const require = createRequire(
  fileURLToPath(new URL('../packages/backend/package.json', import.meta.url)),
);
const { Server: SocketIOServer } = require('socket.io');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.MOCK_BACKEND_PORT || 3001);
const CORS_ORIGIN = process.env.MOCK_BACKEND_CORS_ORIGIN || 'http://localhost:3002';

// ── Mock fixtures ──────────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'mock-user',
  email: 'dev@local',
  name: 'Local Dev',
  profileCompleted: true,
  role: 'user',
  emailVerified: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_TOKEN = 'mock-access-token-for-local-dev';

const MOCK_DOC_ID = 'doc-1';

const MOCK_PLAIN_TEXT = [
  'ok so basically I want to talk about how AI changes writing.',
  '',
  'The motivation here is that traditional plagiarism detectors only',
  'look at the final text, but they miss how the text got there.',
  'They are bad grammar checkers honestly.',
  '',
  'A provenance-first approach watches the keystrokes, the pauses,',
  'and the AI interactions — so the artifact carries its own evidence.',
].join('\n');

const MOCK_LEXICAL_CONTENT = {
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: MOCK_PLAIN_TEXT.split('\n').map((line) => ({
      type: 'paragraph',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: line
        ? [{ type: 'text', text: line, format: 0, detail: 0, style: '', mode: 'normal', version: 1 }]
        : [],
    })),
  },
};

const MOCK_ENVIRONMENT_CONFIG = {
  preset: 'custom',
  taskType: 'personal',
  instructions: {
    hasInstructionPdf: false,
    editableAfterSubmission: true,
  },
  aiAccess: 'full',
  allowedModels: ['GPT-5'],
  customModels: [],
  aiTokenBudget: {
    shortcutMaxTokens: 1024,
    chatMaxTokens: 4096,
  },
  aiUsageLimit: {
    mode: 'max_requests',
    maxRequests: 20,
  },
  time: {
    timeLimitSeconds: 1800,
    lateSubmission: 'allowed',
  },
  submission: {
    mode: 'multiple',
    maxCharacters: 2000,
  },
  traceability: {
    trackAiUsage: true,
    trackTyping: true,
    trackCopyPaste: true,
    trackFocusBlur: true,
  },
  copyPastePolicy: 'allowed',
};

const MOCK_DOC = {
  id: MOCK_DOC_ID,
  userId: MOCK_USER.id,
  title: 'AI changes writing (dev mock)',
  content: MOCK_LEXICAL_CONTENT,
  plainText: MOCK_PLAIN_TEXT,
  status: 'draft',
  version: 1,
  wordCount: MOCK_PLAIN_TEXT.split(/\s+/).filter(Boolean).length,
  characterCount: MOCK_PLAIN_TEXT.length,
  environmentConfig: MOCK_ENVIRONMENT_CONFIG,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastEditedAt: new Date().toISOString(),
};

const mockCertificates = [];

function createMockCertificate(options = {}) {
  const now = new Date().toISOString();
  return {
    id: options.id || uuid(),
    documentId: options.documentId || MOCK_DOC_ID,
    userId: MOCK_USER.id,
    certificateType: options.certificateType || 'full_authorship',
    title: MOCK_DOC.title,
    documentSnapshot: MOCK_DOC.content,
    plainTextSnapshot: MOCK_DOC.plainText,
    totalEvents: 12,
    typingEvents: 9,
    pasteEvents: 1,
    totalCharacters: MOCK_DOC.characterCount,
    typedCharacters: MOCK_DOC.characterCount,
    pastedCharacters: 0,
    editingTimeSeconds: 420,
    signature: 'mock-signature',
    verificationToken: options.verificationToken || uuid(),
    signerName: options.signerName || null,
    includeFullText: options.includeFullText ?? true,
    includeEditHistory: options.includeEditHistory ?? true,
    environmentConfig: MOCK_DOC.environmentConfig,
    isProtected: Boolean(options.accessCode),
    accessCode: options.accessCode || null,
    accessCodeHash: options.accessCode ? 'mock-access-code-hash' : null,
    generatedAt: now,
    pdfGenerated: false,
    pdfUrl: null,
    jsonUrl: null,
    createdAt: now,
  };
}

mockCertificates.push(createMockCertificate({
  id: 'cert-1',
  verificationToken: 'token-1',
  signerName: 'Local Dev',
}));

const MOCK_AI_AUTHORSHIP_STATS = {
  selectionActions: {
    total: 4,
    grammarFixes: 1,
    improveWriting: 1,
    simplify: 1,
    makeFormal: 1,
    accepted: 3,
    rejected: 1,
    acceptanceRate: 75,
  },
  aiQuestions: {
    total: 2,
    understanding: 1,
    generation: 1,
    other: 0,
  },
};

const MOCK_SEAL = {
  version: 'hly-seal-v1',
  algorithm: 'HMAC-SHA256',
  keyId: 'mock-local',
  payloadHash: 'mock-payload-hash-for-local-certificate-smoke',
  signature: 'mock-signature-for-local-certificate-smoke',
  signedFields: [
    'certificateType',
    'documentId',
    'generatedAt',
    'includeEditHistory',
    'includeFullText',
    'pastedCharacters',
    'plainTextSnapshot',
    'title',
    'totalCharacters',
    'totalEvents',
    'typedCharacters',
    'typingEvents',
    'verificationToken',
  ],
};

function mockCertificateEnvelope(certificate) {
  return {
    certificate,
    seal: MOCK_SEAL,
    sealStatus: 'valid',
    integrityMessage: 'Certificate seal is valid',
  };
}

function mockPublicCertificatePayload(certificate) {
  return {
    valid: true,
    ...mockCertificateEnvelope(certificate),
    aiAuthorshipStats: MOCK_AI_AUTHORSHIP_STATS,
    verifiedAt: new Date().toISOString(),
    message: 'Certificate seal is valid',
  };
}

// ── Tiny helpers ───────────────────────────────────────────────────────────

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(body));
}

function ok(res, data) {
  json(res, 200, { success: true, data });
}

function unauthorized(res) {
  json(res, 401, {
    success: false,
    error: 'Unauthorized',
    message: 'Authentication required',
  });
}

function hasMockAuth(req) {
  return req.headers.authorization === `Bearer ${MOCK_TOKEN}`;
}

async function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

function uuid() {
  return 'mock-' + Math.random().toString(36).slice(2, 10);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── REST routes ────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Project-Token, X-Session-Id',
    });
    return res.end();
  }

  const p = url.pathname;

  if (p === '/health') return json(res, 200, { status: 'ok', mock: true });

  // Auth endpoints — frontend expects response.data.user / response.data.accessToken
  if (p === '/api/v1/auth/me') {
    if (!hasMockAuth(req)) return unauthorized(res);
    if (method === 'PATCH') {
      const body = await readBody(req);
      if (typeof body?.name === 'string' && body.name.trim()) {
        MOCK_USER.name = body.name.trim();
        MOCK_USER.profileCompleted = true;
        MOCK_USER.updatedAt = new Date().toISOString();
      }
    }
    return ok(res, { user: MOCK_USER });
  }
  if (p === '/api/v1/auth/login' && method === 'POST') {
    await readBody(req);
    return ok(res, { user: MOCK_USER, accessToken: MOCK_TOKEN, refreshToken: MOCK_TOKEN });
  }
  if (p === '/api/v1/auth/refresh' && method === 'POST') {
    if (!hasMockAuth(req)) return unauthorized(res);
    return ok(res, { accessToken: MOCK_TOKEN, refreshToken: MOCK_TOKEN });
  }
  if (p === '/api/v1/auth/logout' && method === 'POST') {
    return ok(res, { ok: true });
  }
  if (p === '/api/v1/auth/oauth/providers' && method === 'GET') {
    return ok(res, { providers: { google: true, github: true } });
  }

  if (p === '/api/v1/dev/mock-user' && method === 'POST') {
    const body = await readBody(req);
    if (typeof body?.name === 'string') {
      MOCK_USER.name = body.name.trim() || null;
    }
    if (typeof body?.profileCompleted === 'boolean') {
      MOCK_USER.profileCompleted = body.profileCompleted;
    }
    MOCK_USER.updatedAt = new Date().toISOString();
    return ok(res, { user: MOCK_USER });
  }

  if (p === '/api/v1/ai/settings') {
    return ok(res, { baseUrl: 'mock://local', model: 'mock-llm', hasApiKey: true, maskedApiKey: 'mock-****' });
  }

  // Task enrollment list used by the workspace dashboard. Keep empty in mock
  // mode so local visual QA can load both Personal Writing and Assigned Tasks.
  if (p === '/api/v1/tasks/my-enrollments' && method === 'GET') {
    return ok(res, { enrollments: [] });
  }

  // Documents.
  // - GET /documents             expects response.data.data to be an ARRAY (see use-documents.ts)
  // - GET /documents/:id         expects response.data.data.document
  // - GET /documents/:id/paper   expects response.data.data.paper
  // - POST /documents            expects response.data.data.document
  // - PUT  /documents/:id        expects response.data.data.document
  if (p === '/api/v1/documents' && method === 'GET') {
    return ok(res, [MOCK_DOC]);
  }
  if (p === '/api/v1/documents' && method === 'POST') {
    await readBody(req);
    return ok(res, { document: MOCK_DOC });
  }
  if (p.match(/^\/api\/v1\/documents\/[^/]+\/paper$/) && method === 'GET') {
    return ok(res, { paper: null });
  }
  if (p.match(/^\/api\/v1\/documents\/[^/]+$/) && method === 'GET') {
    return ok(res, { document: MOCK_DOC });
  }
  if (p.match(/^\/api\/v1\/documents\/[^/]+$/) && method === 'PUT') {
    await readBody(req);
    return ok(res, { document: MOCK_DOC });
  }
  if (p.match(/^\/api\/v1\/documents\/[^/]+\/events$/) && method === 'POST') {
    const body = await readBody(req);
    const events = Array.isArray(body?.events) ? body.events : [];
    console.log(`[mock] POST /documents/.../events  +${events.length} events`,
      events.map((e) => e.eventType).join(', '));
    return ok(res, { inserted: events.length });
  }

  // Certificates.
  if (p === '/api/v1/certificates' && method === 'GET') {
    const documentId = url.searchParams.get('documentId');
    const certificates = documentId
      ? mockCertificates.filter((certificate) => certificate.documentId === documentId)
      : mockCertificates;
    return json(res, 200, {
      success: true,
      data: certificates,
      pagination: { total: certificates.length, offset: 0, limit: certificates.length || 50 },
    });
  }
  if (p === '/api/v1/certificates' && method === 'POST') {
    const body = await readBody(req);
    const certificate = createMockCertificate(body);
    mockCertificates.unshift(certificate);
    return ok(res, { certificate });
  }
  if (p.match(/^\/api\/v1\/certificates\/verify\/[^/]+\/history$/) && method === 'GET') {
    return ok(res, {
      editHistory: [
        {
          id: 'mock-history-1',
          eventType: 'typing',
          actionType: 'insert',
          timestamp: new Date(Date.now() - 120000).toISOString(),
          textContent: 'ok so basically I want to talk about how AI changes writing.',
          editorStateAfter: {
            root: {
              children: [
                {
                  children: [
                    { text: 'ok so basically I want to talk about how AI changes writing.' },
                  ],
                },
              ],
            },
          },
        },
        {
          id: 'mock-history-2',
          eventType: 'ai_selection_action',
          actionType: 'improve',
          timestamp: new Date(Date.now() - 60000).toISOString(),
          textContent: 'The motivation here is that traditional plagiarism detectors only look at the final text.',
          editorStateAfter: MOCK_LEXICAL_CONTENT,
        },
        {
          id: 'mock-history-3',
          eventType: 'typing',
          actionType: 'insert',
          timestamp: new Date().toISOString(),
          textContent: MOCK_PLAIN_TEXT,
          editorStateAfter: MOCK_LEXICAL_CONTENT,
        },
      ],
    });
  }
  if (p.match(/^\/api\/v1\/certificates\/verify\/[^/]+$/) && method === 'GET') {
    const token = p.split('/').pop();
    const certificate = mockCertificates.find((item) => item.verificationToken === token) || null;
    return certificate
      ? ok(res, mockPublicCertificatePayload(certificate))
      : json(res, 404, { success: false, data: { valid: false, message: 'Certificate not found' } });
  }
  if (p.match(/^\/api\/v1\/certificates\/[^/]+\/ai-stats$/) && method === 'GET') {
    return ok(res, MOCK_AI_AUTHORSHIP_STATS);
  }
  if (p.match(/^\/api\/v1\/certificates\/[^/]+$/) && method === 'GET') {
    const certificateId = p.split('/').pop();
    const certificate = mockCertificates.find((item) => item.id === certificateId) || null;
    return certificate ? ok(res, mockCertificateEnvelope(certificate)) : json(res, 404, { success: false, message: 'Certificate not found' });
  }

  if (p.startsWith('/api/v1/ai/sessions/detail/')) {
    return ok(res, { id: uuid(), documentId: MOCK_DOC_ID, userId: MOCK_USER.id, messages: [], createdAt: new Date(), updatedAt: new Date(), status: 'active' });
  }
  if (p.startsWith('/api/v1/ai/sessions/')) {
    return ok(res, []);
  }
  if (p === '/api/v1/ai/chat' && method === 'POST') {
    const body = await readBody(req);
    console.log('[mock] POST /api/v1/ai/chat (legacy silent path)', { silent: body?.silent });
    return ok(res, {
      sessionId: body?.silent ? 'silent' : uuid(),
      message: { id: uuid(), role: 'assistant', content: 'Mock rewrite of: ' + (body?.message?.slice?.(-80) || ''), timestamp: new Date() },
      logId: uuid(),
    });
  }
  if (p === '/api/v1/ai/selection-action' && method === 'POST') {
    const body = await readBody(req);
    console.log('[mock] POST /api/v1/ai/selection-action', { actionType: body?.actionType, decision: body?.decision });
    return ok(res, { recorded: true });
  }
  if (p === '/api/v1/ai/logs') {
    return json(res, 200, { success: true, data: [], pagination: { total: 0, offset: 0, limit: 20 } });
  }
  if (p.match(/^\/api\/v1\/ai\/sessions\/[^/]+$/) && method === 'DELETE') {
    return ok(res, { closed: true });
  }

  // Default: 404 JSON
  json(res, 404, { success: false, error: 'Not found in mock', path: p });
});

// ── Socket.IO ──────────────────────────────────────────────────────────────

const io = new SocketIOServer(server, {
  cors: { origin: CORS_ORIGIN, credentials: true },
});

// Tracks { cancelled: boolean } per messageId so ai:cancel can abort
const inflight = new Map();

io.on('connection', (socket) => {
  console.log('[mock] socket connected', socket.id);

  socket.on('ai:join-session', () => {
    socket.emit('ai:response-complete', {
      sessionId: uuid(),
      message: { id: 'system', role: 'system', content: 'Connected to mock AI assistant', timestamp: new Date() },
      logId: '',
    });
  });

  socket.on('ai:leave-session', () => {});

  socket.on('ai:cancel', ({ sessionId }) => {
    console.log('[mock] ai:cancel', sessionId);
    for (const [mid, state] of inflight) {
      if (state.sessionId === sessionId) state.cancelled = true;
    }
  });

  socket.on('ai:message', async (data) => {
    const messageId = uuid();
    const silent = !!data?.silent;
    const sessionId = silent ? 'silent' : (data?.sessionId || uuid());
    const state = { cancelled: false, sessionId };
    inflight.set(messageId, state);

    socket.emit('ai:response-start', { sessionId, messageId });
    console.log(`[mock] ai:message  silent=${silent}  msg="${(data?.message || '').slice(0, 60)}"`);

    try {
      if (silent) {
        // Quick-action streaming: typewriter the rewrite, no tool calls.
        const rewrite = mockRewriteFor(data?.message || '', data?.context);
        for (const chunk of chunkify(rewrite, 4)) {
          if (state.cancelled) return;
          socket.emit('ai:response-chunk', { sessionId, messageId, chunk });
          await sleep(30);
        }
        if (state.cancelled) return;
        socket.emit('ai:response-complete', {
          sessionId,
          message: { id: messageId, role: 'assistant', content: rewrite, timestamp: new Date() },
          logId: '',
        });
      } else {
        // Chat path: optionally emit a realistic ls → grep → read tool
        // chain (matches the new 3-tool primitives from #70). Triggers
        // on search-like intent so prompts like "find motivation" and
        // "summarize this paper" both exercise the chain.
        const wantsTool = /search|find|where|motivation|grammar|paper|summari[sz]e|conclusion/i.test(data?.message || '');
        if (wantsTool) {
          socket.emit('ai:turn-start', { sessionId, messageId, turnIndex: 0 });
          socket.emit('ai:thinking-delta', {
            sessionId,
            messageId,
            text: 'I should list available files first, locate the relevant region with grep, then read it.',
          });
          // ls
          const lsCallId = uuid();
          socket.emit('ai:tool-call', {
            sessionId, messageId, toolCallId: lsCallId,
            toolName: 'ls',
            args: {},
          });
          await sleep(150);
          if (state.cancelled) return;
          socket.emit('ai:tool-result', {
            sessionId, messageId, toolCallId: lsCallId,
            result: JSON.stringify({
              files: [{ id: 'mock-ref-1', filename: 'mock-reference.pdf' }],
            }),
            isError: false,
            durationMs: 150,
          });
          // grep
          const grepCallId = uuid();
          const pattern = extractQuery(data?.message || '') || 'motivation';
          socket.emit('ai:tool-call', {
            sessionId, messageId, toolCallId: grepCallId,
            toolName: 'grep',
            args: { file: 'mock-ref-1', pattern, context_before: 1, context_after: 2 },
          });
          await sleep(200);
          if (state.cancelled) return;
          socket.emit('ai:tool-result', {
            sessionId, messageId, toolCallId: grepCallId,
            result: JSON.stringify({
              file: 'mock-ref-1',
              pattern,
              matchCount: 1,
              matches: [{
                line: 14,
                page: 1,
                text: `The ${pattern} here is that traditional plagiarism detectors only`,
                contextLines: [
                  { line: 13, text: '', isMatch: false },
                  { line: 14, text: `The ${pattern} here is that traditional plagiarism detectors only`, isMatch: true },
                  { line: 15, text: 'look at the final text, but they miss how the text got there.', isMatch: false },
                  { line: 16, text: 'They are bad grammar checkers honestly.', isMatch: false },
                ],
              }],
            }),
            isError: false,
            durationMs: 200,
          });
          // read
          const readCallId = uuid();
          socket.emit('ai:tool-call', {
            sessionId, messageId, toolCallId: readCallId,
            toolName: 'read',
            args: { file: 'mock-ref-1', offset: 12, limit: 20 },
          });
          await sleep(150);
          if (state.cancelled) return;
          socket.emit('ai:tool-result', {
            sessionId, messageId, toolCallId: readCallId,
            result: JSON.stringify({
              file: 'mock-ref-1',
              offset: 12,
              limit: 20,
              totalLines: 42,
              hasPages: true,
              pageRange: { start: 1, end: 1 },
              truncated: false,
              lines: [
                { line: 12, text: '[page 1]' },
                { line: 13, text: '' },
                { line: 14, text: `The ${pattern} here is that traditional plagiarism detectors only` },
                { line: 15, text: 'look at the final text, but they miss how the text got there.' },
              ],
            }),
            isError: false,
            durationMs: 150,
          });
          socket.emit('ai:turn-end', { sessionId, messageId, turnIndex: 0 });
        }

        const reply = mockChatReplyFor(data?.message || '');
        for (const chunk of chunkify(reply, 6)) {
          if (state.cancelled) return;
          socket.emit('ai:response-chunk', { sessionId, messageId, chunk });
          await sleep(35);
        }
        if (state.cancelled) return;
        socket.emit('ai:response-complete', {
          sessionId,
          message: { id: messageId, role: 'assistant', content: reply, timestamp: new Date() },
          logId: uuid(),
        });
      }
    } catch (err) {
      socket.emit('ai:error', { sessionId, message: String(err?.message || err), code: 'MOCK_ERROR' });
    } finally {
      inflight.delete(messageId);
    }
  });

  socket.on('disconnect', () => {
    console.log('[mock] socket disconnected', socket.id);
  });
});

// ── Mock content shaping ───────────────────────────────────────────────────

function chunkify(s, size) {
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

function extractQuery(message) {
  const m = message.match(/(?:for|of|about)?\s*(['"])(.*?)\1/) || message.match(/word\s+(\w+)/i);
  return m ? (m[2] || m[1]) : message.slice(0, 40);
}

function mockRewriteFor(prompt, context) {
  // Strip the "fix grammar:" prefix so we can detect intent.
  const lower = prompt.toLowerCase();
  const selected = (context?.selectedText || prompt.split('\n').pop() || '').replace(/^"|"$/g, '');
  const surroundingHint = context?.surroundingContext
    ? ` [voice-aware: title="${context.surroundingContext.documentTitle?.slice(0, 30) || ''}"]`
    : '';
  if (lower.includes('grammar') || lower.includes('spelling')) {
    return selected.replace(/\bare\b/g, 'is').replace(/\bThey\b/g, 'It') + surroundingHint;
  }
  if (lower.includes('improve')) {
    return `A clearer version of: ${selected}.${surroundingHint}`;
  }
  if (lower.includes('simplify')) {
    return selected.split(/[,.]/)[0].trim() + '.' + surroundingHint;
  }
  if (lower.includes('formal')) {
    return selected.replace(/\bok\b/gi, 'Indeed,').replace(/\bbasically\b/gi, 'fundamentally') + surroundingHint;
  }
  return `Rewritten: ${selected}.${surroundingHint}`;
}

function mockChatReplyFor(message) {
  const intro = /\?\s*$/.test(message)
    ? 'Based on the document, '
    : 'Here is what I found: ';
  if (/grade|grading|percent|table/i.test(message)) {
    return [
      'Based on the document, here is the grading table:',
      '',
      '| Component | Percentage |',
      '| --- | ---: |',
      '| Attendance and Participation | 18% |',
      '| Final Exam | 34% |',
    ].join('\n');
  }
  if (/motivation/i.test(message)) {
    return intro + 'the motivation appears in the second paragraph — provenance-first beats post-hoc detection.';
  }
  if (/summari[sz]e/i.test(message)) {
    return intro + 'this document argues that watching the writing process is more diagnostic than scanning the output.';
  }
  return intro + 'I read the document, and I am happy to dig deeper on any specific passage you point at.';
}

// ── Start ──────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[mock] humanly mock backend listening on http://localhost:${PORT}`);
  console.log(`[mock] CORS allowed origin: ${CORS_ORIGIN}`);
  console.log(`[mock] mock doc: ${MOCK_DOC_ID} — open http://localhost:3002/dev-bypass-login.html`);
});

process.on('SIGINT', () => {
  console.log('\n[mock] shutting down');
  process.exit(0);
});
