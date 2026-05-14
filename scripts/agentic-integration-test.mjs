#!/usr/bin/env node
/**
 * End-to-end agentic chat integration test.
 *
 * Boots a self-contained replica of the AgentRunner loop against a real
 * Together AI endpoint, with the same four read-only tools the production
 * backend exposes. The "document" is the user-supplied syllabus PDF
 * (treated as a linked paper so the listLinkedPapers + getPaperContent
 * flow is exercised end to end).
 *
 * Captures every step of the canonical agent trace —
 *   user-input → thinking → tool-call → env-feedback → thinking →
 *   tool-call → env-feedback → output
 * — into a JSON timeline plus a human-readable markdown transcript.
 *
 * Usage:
 *   TOGETHER_API_KEY=tgp_v1_... \
 *   AGENT_TEST_PDF=/path/to/file.pdf \
 *   AGENT_TEST_MODEL='Qwen/Qwen3.5-397B-A17B' \
 *   AGENT_TEST_PROMPTS='1,5' \
 *     node scripts/agentic-integration-test.mjs
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

// Resolve deps through the backend package's node_modules (pnpm doesn't hoist
// socket.io / openai / pdfjs-dist to the workspace root).
const require = createRequire(
  fileURLToPath(new URL('../packages/backend/package.json', import.meta.url)),
);
const OpenAI = require('openai').default || require('openai');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const API_KEY = process.env.TOGETHER_API_KEY || process.env.AI_API_KEY;
if (!API_KEY) {
  console.error('Missing TOGETHER_API_KEY (or AI_API_KEY) in env');
  process.exit(1);
}
const BASE_URL = process.env.AGENT_TEST_BASE_URL || 'https://api.together.xyz/v1';
const MODEL = process.env.AGENT_TEST_MODEL || 'Qwen/Qwen3.5-397B-A17B';
const PDF_PATH = process.env.AGENT_TEST_PDF
  || path.join(process.env.HOME || '', 'Desktop', 'ENV100-2026F-Summer-Syllabus.pdf');
const MAX_TURNS = Number(process.env.AGENT_TEST_MAX_TURNS || 8);
const OUT_DIR = path.join(REPO_ROOT, 'tmp', 'agent-trace');
fs.mkdirSync(OUT_DIR, { recursive: true });

const PROMPT_CASES = [
  // 1. simple lookup — should fire listLinkedPapers then getPaperContent(mode=search)
  {
    prompt: 'Who is the instructor for ENV 100 and when are their office hours? Cite the page you found it on.',
    minToolCalls: 2,
    requireTools: ['listLinkedPapers', 'getPaperContent'],
  },
  // 2. multi-step grading-policy lookup
  {
    prompt: 'How is the final grade calculated? List every assessment and its percentage weight.',
    minToolCalls: 2,
    requireTools: ['listLinkedPapers', 'getPaperContent'],
    finalMustMatch: [/%|percent/i],
  },
  // 3. fact buried in a section — should drive mode=section or mode=search
  {
    prompt: 'What are the learning outcomes of this course?',
    minToolCalls: 2,
    requireTools: ['listLinkedPapers', 'getPaperContent'],
  },
  // 4. requires the model to chain at least two searches
  {
    prompt: 'Compare the late-submission policy and the academic-integrity policy. Quote the relevant lines.',
    minToolCalls: 3,
    requireTools: ['listLinkedPapers', 'getPaperContent'],
  },
  // 5. negative test — answer not in document
  {
    prompt: 'What is the price of a campus parking permit per semester?',
    minToolCalls: 2,
    requireTools: ['listLinkedPapers', 'getPaperContent'],
    finalMustMatch: [/cannot find|not enough evidence|no evidence|not found|do(?:es)? not (?:state|mention|include|contain)|don['’]?t (?:have|see|contain)|outside the scope/i],
    finalMustNotMatch: [/\$\s*\d+/],
  },
  // 6. route through both current document text and linked PDF
  {
    prompt: 'First check the current document notes, then use the linked syllabus PDF. In one sentence, what is ENV 100 about?',
    minToolCalls: 3,
    requireTools: ['getDocumentText', 'listLinkedPapers', 'getPaperContent'],
  },
  // 7. structured-output edge case — tools should still be used before JSON
  {
    prompt: 'Return a JSON object with exactly these keys: instructor, officeHours, assessments. Use only evidence from the PDF.',
    minToolCalls: 2,
    requireTools: ['listLinkedPapers', 'getPaperContent'],
    expectJsonObject: true,
  },
  // 8. policy missing/ambiguity edge case
  {
    prompt: 'Does the syllabus explicitly say students may use ChatGPT or other generative AI tools? Answer with cited evidence; if there is no explicit evidence, say that.',
    minToolCalls: 2,
    requireTools: ['listLinkedPapers', 'getPaperContent'],
    finalMustMatch: [/prohibit|may not use|restriction|generative AI|artificial intelligence/i],
  },
  // 9. partial-evidence edge case — avoid inventing precise dates
  {
    prompt: 'Find exact calendar due dates for the major assignments. If exact dates are not listed, say exact dates not found and identify what is listed instead.',
    minToolCalls: 2,
    requireTools: ['listLinkedPapers', 'getPaperContent'],
  },
];

function getSelectedPromptCases() {
  const raw = process.env.AGENT_TEST_PROMPTS;
  if (!raw) return PROMPT_CASES.map((promptCase, index) => ({ index: index + 1, ...promptCase }));

  const selected = raw.split(',')
    .map((part) => Number(part.trim()))
    .filter((index) => Number.isInteger(index) && index >= 1 && index <= PROMPT_CASES.length)
    .map((index) => ({ index, ...PROMPT_CASES[index - 1] }));

  if (selected.length === 0) {
    throw new Error(`AGENT_TEST_PROMPTS did not include any valid prompt numbers. Use values from 1 to ${PROMPT_CASES.length}.`);
  }

  return selected;
}

// ── Load + index the PDF as the mock "linked paper" ────────────────────────

console.log(`[setup] reading PDF: ${PDF_PATH}`);
const pdfBuffer = fs.readFileSync(PDF_PATH);

const pdfPackageDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const pdf = await pdfjs.getDocument({
  data: new Uint8Array(pdfBuffer),
  disableWorker: true,
  standardFontDataUrl: path.join(pdfPackageDir, 'standard_fonts') + path.sep,
}).promise;

const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const tc = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
  pages.push({ pageNumber: i, text: tc.items.map((it) => it.str).join(' ') });
}
console.log(`[setup] indexed ${pages.length} pages`);

const fullPlainText = pages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join('\n\n');

// Detect rough sections by uppercase headings + the syllabus's TOC entries.
const sectionPatterns = [
  /COURSE DESCRIPTION/i, /LEARNING OUTCOMES/i, /TEACHING AND LEARNING PHILOSOPHY/i,
  /EXPECTATIONS/i, /TUTORIAL/i, /ASSIGNMENT/i, /ASSESSMENT/i, /GRADING/i,
  /LATE/i, /ACADEMIC INTEGRITY/i, /ACCESSIBILITY/i, /OFFICE HOURS/i,
];
const sections = [];
for (const page of pages) {
  for (const re of sectionPatterns) {
    const m = page.text.match(re);
    if (m) {
      const start = page.text.indexOf(m[0]);
      const snippet = page.text.slice(start, Math.min(page.text.length, start + 1200));
      sections.push({ title: m[0], page: page.pageNumber, text: snippet });
    }
  }
}

const MOCK_DOC_ID = 'doc-1';
const MOCK_PAPER_ID = 'paper-syllabus';
const MOCK_PAPER_TITLE = 'ENV 100 Summer 2026 Syllabus';

// ── Tool registry — schema mirrors AIRetrievalService.tools ────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getDocumentText',
      description: 'Retrieve the latest plain text for the current document.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { documentId: { type: 'string' } },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchDocument',
      description: 'Grep-style keyword search over the current document. Returns the most relevant excerpts with their character offsets.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          documentId: { type: 'string' },
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['documentId', 'query', 'limit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listLinkedPapers',
      description: 'List PDF papers linked to the current document (use this before calling getPaperContent to discover paper IDs).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { documentId: { type: 'string' } },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPaperContent',
      description: 'Retrieve content from a linked PDF paper. Choose mode = "search" (keyword search; supply query), "page" (specific page; supply pageNumber), or "section" (named section like "Methods"; supply sectionTitle).',
      parameters: {
        type: 'object',
        properties: {
          paperId: { type: 'string' },
          mode: { type: 'string', enum: ['search', 'page', 'section'] },
          query: { type: 'string' },
          pageNumber: { type: 'integer' },
          sectionTitle: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['paperId', 'mode'],
      },
    },
  },
];

// ── Tool dispatcher ───────────────────────────────────────────────────────

function scoreText(text, terms) {
  const lower = text.toLowerCase();
  return terms.reduce((s, t) => s + (lower.includes(t) ? 1 : 0), 0);
}

function clampLimit(n, fallback = 10, max = 25) {
  if (!n || Number.isNaN(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), max);
}

function searchPaperPages(paperId, query, limit) {
  if (paperId !== MOCK_PAPER_ID) return { paperId, results: [], error: 'unknown paperId' };
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return {
    paperId,
    query,
    results: pages
      .map((p) => ({ pageNumber: p.pageNumber, text: p.text, score: scoreText(p.text, terms) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, clampLimit(limit))
      .map(({ pageNumber, text }) => ({
        source: 'paper',
        pageNumber,
        text: text.length > 2500 ? text.slice(0, 2500) + '\n[truncated]' : text,
      })),
  };
}

function getPaperPage(paperId, pageNumber) {
  if (paperId !== MOCK_PAPER_ID) return { error: 'unknown paperId' };
  const p = pages.find((x) => x.pageNumber === pageNumber);
  if (!p) return { error: `page ${pageNumber} not found` };
  return { paperId, pageNumber, text: p.text };
}

function getPaperSection(paperId, sectionTitle) {
  if (paperId !== MOCK_PAPER_ID) return { error: 'unknown paperId' };
  const lower = sectionTitle.toLowerCase();
  const hit = sections.find((s) => s.title.toLowerCase().includes(lower));
  if (!hit) return { error: `section "${sectionTitle}" not detected` };
  return { paperId, sectionTitle: hit.title, page: hit.page, text: hit.text };
}

function searchDocumentText(documentId, query, limit) {
  if (documentId !== MOCK_DOC_ID) return { error: 'unknown documentId' };
  const docText = 'This is the user document. The user is writing notes about the linked ENV 100 syllabus.';
  return { documentId, query, results: docText.toLowerCase().includes(query.toLowerCase()) ? [{ source: 'document', text: docText }] : [] };
}

async function executeTool(name, args) {
  switch (name) {
    case 'getDocumentText':
      return {
        documentId: args.documentId,
        title: 'My ENV 100 notes (test doc)',
        plainText: 'This is the user document. The user is writing notes about the linked ENV 100 syllabus.',
        wordCount: 15,
        characterCount: 90,
      };
    case 'searchDocument':
      return searchDocumentText(args.documentId, args.query, args.limit);
    case 'listLinkedPapers':
      return {
        documentId: args.documentId,
        papers: [{ id: MOCK_PAPER_ID, title: MOCK_PAPER_TITLE, pdfPageCount: pages.length }],
      };
    case 'getPaperContent': {
      const mode = args.mode;
      if (mode === 'search') return searchPaperPages(args.paperId, args.query || '', args.limit);
      if (mode === 'page') return getPaperPage(args.paperId, args.pageNumber);
      if (mode === 'section') return getPaperSection(args.paperId, args.sectionTitle || '');
      return { error: `unknown mode "${mode}"` };
    }
    default:
      return { error: `unknown tool "${name}"` };
  }
}

// ── Agent loop ────────────────────────────────────────────────────────────

const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

const SYSTEM_PROMPT = `You are an AI writing assistant. The user is writing notes alongside an attached syllabus PDF.

Use the retrieval tools as your source of truth — never invent facts about the document or syllabus.

Routing:
- For the user's current notes, call getDocumentText / searchDocument with documentId = "${MOCK_DOC_ID}".
- For the linked syllabus PDF, call listLinkedPapers first to discover paper IDs, then call getPaperContent with mode="search" (keyword) / "page" (specific page) / "section" (named section).
- Chain multiple tool calls if the answer needs multiple sources.

When you don't have evidence, say so explicitly. Be concise.`;

function extractThinkingFromContent(content) {
  // Best-effort parse of inline reasoning blocks. Handles two patterns:
  //   (a) Qwen-thinking / generic: `<think>...reasoning...</think>visible`
  //   (b) DeepSeek-R1 via Together: `...reasoning...</think>visible`
  //       (opening tag stripped by the API; reasoning starts at content head)
  // Returns { thinking, visible }.
  if (!content) return { thinking: '', visible: '' };
  let thinking = '';
  let visible = content;

  const openTag = '<think>';
  const closeTag = '</think>';
  const closeIdx = content.indexOf(closeTag);
  const openIdx = content.indexOf(openTag);

  if (closeIdx >= 0 && (openIdx < 0 || openIdx > closeIdx)) {
    // Implicit-open: take content[0..closeIdx] as thinking, rest as visible.
    thinking = content.slice(0, closeIdx).trim();
    visible = content.slice(closeIdx + closeTag.length).trim();
  } else if (openIdx >= 0 && closeIdx > openIdx) {
    thinking = content.slice(openIdx + openTag.length, closeIdx).trim();
    visible = (content.slice(0, openIdx) + content.slice(closeIdx + closeTag.length)).trim();
  }
  return { thinking, visible };
}

async function runAgent(userPrompt, traceFile) {
  const trace = [];
  const emit = (event) => {
    const stamped = { t: Date.now(), ...event };
    trace.push(stamped);
    const tag = event.type.padEnd(14);
    let preview = '';
    if (event.type === 'user-message') preview = event.content.slice(0, 120);
    else if (event.type === 'thinking-delta') preview = event.text.slice(0, 80).replace(/\n/g, ' ');
    else if (event.type === 'text-delta') preview = event.text.slice(0, 80).replace(/\n/g, ' ');
    else if (event.type === 'tool-call') preview = `${event.toolName} ${JSON.stringify(event.args).slice(0, 100)}`;
    else if (event.type === 'tool-result') preview = `${event.toolName} → ${(typeof event.result === 'string' ? event.result : JSON.stringify(event.result)).slice(0, 120)}`;
    else if (event.type === 'turn-start') preview = `turn ${event.turnIndex}`;
    else if (event.type === 'turn-end') preview = `turn ${event.turnIndex} finish=${event.finishReason || ''}`;
    else if (event.type === 'final') preview = (event.text || '').slice(0, 120);
    else if (event.type === 'error') preview = event.message;
    console.log(`  ${tag} ${preview}`);
  };

  emit({ type: 'user-message', content: userPrompt });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  for (let turnIndex = 0; turnIndex < MAX_TURNS; turnIndex++) {
    emit({ type: 'turn-start', turnIndex });

    let stream;
    try {
      stream = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        stream: true,
        max_tokens: Number(process.env.AGENT_TEST_MAX_TOKENS || 2048),
      });
    } catch (error) {
      emit({ type: 'error', message: `chat.completions failed: ${error?.message || error}` });
      break;
    }

    // Streaming accumulators
    let contentSoFar = '';
    let reasoningSoFar = '';
    const toolCallAccs = new Map(); // index -> { id, name, argsText }
    let finishReason;

    let thinkBufferOpen = false; // inside a <think> block in content

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta || {};
      finishReason = chunk.choices?.[0]?.finish_reason || finishReason;

      // Models with explicit reasoning_content (DeepSeek-R1, some Qwen-thinking)
      if (delta.reasoning_content) {
        reasoningSoFar += delta.reasoning_content;
        emit({ type: 'thinking-delta', text: delta.reasoning_content });
      }

      // Visible content; also strip <think>...</think> blocks if present.
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        const piece = delta.content;
        contentSoFar += piece;
        if (piece.includes('<think>')) thinkBufferOpen = true;
        if (thinkBufferOpen) {
          emit({ type: 'thinking-delta', text: piece });
          if (piece.includes('</think>')) thinkBufferOpen = false;
        } else {
          emit({ type: 'text-delta', text: piece });
        }
      }

      // Streamed tool call args
      const toolDeltas = delta.tool_calls || [];
      for (const td of toolDeltas) {
        const idx = td.index ?? 0;
        const existing = toolCallAccs.get(idx) || { id: '', name: '', argsText: '' };
        if (td.id) existing.id = td.id;
        if (td.function?.name) existing.name = td.function.name;
        if (td.function?.arguments) existing.argsText += td.function.arguments;
        toolCallAccs.set(idx, existing);
      }
    }

    // Normalize: split content into thinking vs visible if model used inline <think>.
    const { thinking: inlineThinking, visible: visibleContent } = extractThinkingFromContent(contentSoFar);
    if (inlineThinking && !reasoningSoFar) {
      reasoningSoFar = inlineThinking; // already emitted as deltas above
    }

    const toolCalls = Array.from(toolCallAccs.values());

    if (toolCalls.length === 0) {
      // Final response — no more tools to call.
      emit({ type: 'final', text: visibleContent.trim(), thinking: reasoningSoFar.trim() });
      emit({ type: 'turn-end', turnIndex, finishReason });
      break;
    }

    // Append the assistant message so the next iteration sees it.
    messages.push({
      role: 'assistant',
      content: visibleContent || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id || `call_${turnIndex}_${tc.name}`,
        type: 'function',
        function: { name: tc.name, arguments: tc.argsText || '{}' },
      })),
    });

    for (const tc of toolCalls) {
      let parsedArgs = {};
      try { parsedArgs = JSON.parse(tc.argsText || '{}'); } catch { parsedArgs = { _raw: tc.argsText }; }
      emit({ type: 'tool-call', toolCallId: tc.id, toolName: tc.name, args: parsedArgs });

      const started = Date.now();
      let result;
      try {
        result = await executeTool(tc.name, parsedArgs);
      } catch (error) {
        result = { error: error?.message || String(error) };
      }
      emit({
        type: 'tool-result',
        toolCallId: tc.id,
        toolName: tc.name,
        result,
        durationMs: Date.now() - started,
      });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id || `call_${turnIndex}_${tc.name}`,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    emit({ type: 'turn-end', turnIndex, finishReason });
  }

  fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2));
  return trace;
}

// ── Render a markdown summary for the whole run ───────────────────────────

function summarizeTrace(prompt, trace) {
  const lines = [];
  lines.push(`### Prompt`);
  lines.push(`> ${prompt}`);
  lines.push('');
  lines.push(`### Trace`);
  let turn = -1;
  for (const e of trace) {
    if (e.type === 'turn-start') {
      turn = e.turnIndex;
      lines.push(`\n#### Turn ${turn}`);
    } else if (e.type === 'thinking-delta') {
      // skip in summary (we surface aggregated thinking with 'final' / per-turn)
    } else if (e.type === 'text-delta') {
      // ditto
    } else if (e.type === 'tool-call') {
      lines.push(`- 🔧 **tool-call** \`${e.toolName}\` args: \`${JSON.stringify(e.args)}\``);
    } else if (e.type === 'tool-result') {
      const r = typeof e.result === 'string' ? e.result : JSON.stringify(e.result);
      const short = r.length > 280 ? r.slice(0, 280) + '…' : r;
      lines.push(`- 📦 **tool-result** \`${e.toolName}\` (${e.durationMs}ms): \`${short}\``);
    } else if (e.type === 'final') {
      lines.push(`\n#### Final answer`);
      if (e.thinking) lines.push(`\n*Thinking:*\n\n> ${e.thinking.slice(0, 1200).replace(/\n/g, '\n> ')}`);
      lines.push(`\n${e.text || '_(empty)_'}`);
    } else if (e.type === 'error') {
      lines.push(`- ❌ error: ${e.message}`);
    }
  }
  return lines.join('\n');
}

function hasPseudoToolMarkup(text) {
  return /<function=|<\/tool_call>|<parameter=|<\/function>/i.test(text || '');
}

function extractJsonObject(text) {
  const trimmed = (text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function validateTrace(promptNumber, promptCase, trace) {
  const failures = [];
  const prompt = promptCase.prompt;
  const errors = trace.filter((event) => event.type === 'error');
  const finals = trace.filter((event) => event.type === 'final');
  const finalText = finals.map((event) => event.text || '').join('\n').trim();
  const visibleText = trace
    .filter((event) => event.type === 'text-delta' || event.type === 'final')
    .map((event) => event.text || '')
    .join('');
  const toolCalls = trace.filter((event) => event.type === 'tool-call');
  const calledTools = new Set(toolCalls.map((event) => event.toolName));

  if (errors.length > 0) {
    failures.push(`Prompt ${promptNumber}: ${errors.map((event) => event.message).join('; ')}`);
  }
  if (!finalText) {
    failures.push(`Prompt ${promptNumber}: missing non-empty final answer for "${prompt}"`);
  }
  if (hasPseudoToolMarkup(visibleText)) {
    failures.push(`Prompt ${promptNumber}: model leaked pseudo tool-call markup into visible text`);
  }
  if (promptCase.minToolCalls && toolCalls.length < promptCase.minToolCalls) {
    failures.push(`Prompt ${promptNumber}: expected at least ${promptCase.minToolCalls} tool calls, got ${toolCalls.length}`);
  }
  for (const toolName of promptCase.requireTools || []) {
    if (!calledTools.has(toolName)) {
      failures.push(`Prompt ${promptNumber}: expected tool ${toolName} to be called`);
    }
  }
  for (const pattern of promptCase.finalMustMatch || []) {
    if (!pattern.test(finalText)) {
      failures.push(`Prompt ${promptNumber}: final answer did not match ${pattern}`);
    }
  }
  for (const pattern of promptCase.finalMustNotMatch || []) {
    if (pattern.test(finalText)) {
      failures.push(`Prompt ${promptNumber}: final answer unexpectedly matched ${pattern}`);
    }
  }
  if (promptCase.expectJsonObject && !extractJsonObject(finalText)) {
    failures.push(`Prompt ${promptNumber}: expected final answer to contain a parseable JSON object`);
  }

  return failures;
}

// ── Run all prompts ───────────────────────────────────────────────────────

const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const selectedPromptCases = getSelectedPromptCases();
const masterSummary = [
  `# Agentic chat integration test`,
  ``,
  `- Run at: ${new Date().toISOString()}`,
  `- Model: \`${MODEL}\``,
  `- Base URL: \`${BASE_URL}\``,
  `- PDF: \`${PDF_PATH}\` (${pages.length} pages)`,
  `- Prompt cases: ${selectedPromptCases.map((promptCase) => promptCase.index).join(', ')}`,
  ``,
];
const validationFailures = [];

for (let i = 0; i < selectedPromptCases.length; i++) {
  const promptCase = selectedPromptCases[i];
  const prompt = promptCase.prompt;
  console.log(`\n==== [${i + 1}/${selectedPromptCases.length}; case ${promptCase.index}] ${prompt}\n`);
  const traceFile = path.join(OUT_DIR, `run-${runStamp}-prompt${promptCase.index}.json`);
  let trace;
  try {
    trace = await runAgent(prompt, traceFile);
  } catch (error) {
    console.error('[fatal]', error);
    trace = [{ type: 'error', message: error?.message || String(error) }];
    fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2));
  }
  masterSummary.push(`---`);
  masterSummary.push(`## Prompt ${promptCase.index}`);
  masterSummary.push(summarizeTrace(prompt, trace));
  masterSummary.push('');
  validationFailures.push(...validateTrace(promptCase.index, promptCase, trace));
}

const summaryFile = path.join(OUT_DIR, `run-${runStamp}-summary.md`);
fs.writeFileSync(summaryFile, masterSummary.join('\n'));
console.log(`\n[done] summary written to ${summaryFile}`);
console.log(`[done] per-prompt traces in ${OUT_DIR}/run-${runStamp}-prompt*.json`);

if (validationFailures.length > 0) {
  console.error('\n[failed] agent smoke validation failed:');
  for (const failure of validationFailures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
