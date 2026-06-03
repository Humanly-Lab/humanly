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

// Prompts now exercise the #70 ls / grep / read primitives. Every prompt
// expects at minimum an ls() call (always cheap, always first) plus one of
// grep / read once the agent locates what it needs.
const PROMPT_CASES = [
  // 1. simple lookup
  {
    prompt: 'Who is the instructor for ENV 100 and when are their office hours? Cite the page you found it on.',
    minToolCalls: 2,
    requireTools: ['ls'],
    requireAnyOf: [['grep', 'read']],
  },
  // 2. multi-step grading-policy lookup
  {
    prompt: 'How is the final grade calculated? List every assessment and its percentage weight.',
    minToolCalls: 2,
    requireTools: ['ls'],
    requireAnyOf: [['grep', 'read']],
    finalMustMatch: [/%|percent/i],
  },
  // 3. fact buried in a section
  {
    prompt: 'What are the learning outcomes of this course?',
    minToolCalls: 2,
    requireTools: ['ls'],
    requireAnyOf: [['grep', 'read']],
  },
  // 4. should chain across two regions; expect at least one extra grep
  {
    prompt: 'Compare the late-submission policy and the academic-integrity policy. Quote the relevant lines.',
    minToolCalls: 3,
    requireTools: ['ls'],
    requireAnyOf: [['grep', 'read']],
  },
  // 5. negative test — answer not in document. Fallback ladder should kick in
  // and the agent should refuse rather than fabricate.
  {
    prompt: 'What is the price of a campus parking permit per semester?',
    minToolCalls: 2,
    requireTools: ['ls'],
    requireAnyOf: [['grep', 'read']],
    finalMustMatch: [/cannot find|not enough evidence|no evidence|not found|do(?:es)? not (?:state|mention|include|contain)|don['’]?t (?:have|see|contain)|outside the scope/i],
    finalMustNotMatch: [/\$\s*\d+/],
  },
  // 6. editor-content question — must REFUSE because the schema has no
  // editor tool. Mentions of Quick Actions or "paste it" are acceptable.
  {
    prompt: 'Summarize what I just wrote in the editor.',
    minToolCalls: 0,
    finalMustMatch: [/quick action|paste|cannot|don['’]?t (?:have|see)|only.*reference|uploaded/i],
    finalMustNotMatch: [/getDocumentText|searchDocument/],
  },
  // 7. structured output — must still use tools before emitting JSON
  {
    prompt: 'Return a JSON object with exactly these keys: instructor, officeHours, assessments. Use only evidence from the PDF.',
    minToolCalls: 2,
    requireTools: ['ls'],
    requireAnyOf: [['grep', 'read']],
    expectJsonObject: true,
  },
  // 8. policy lookup
  {
    prompt: 'Does the syllabus explicitly say students may use ChatGPT or other generative AI tools? Answer with cited evidence; if there is no explicit evidence, say that.',
    minToolCalls: 2,
    requireTools: ['ls'],
    requireAnyOf: [['grep', 'read']],
    finalMustMatch: [/prohibit|may not use|restriction|generative AI|artificial intelligence/i],
  },
  // 9. partial-evidence edge case — avoid inventing precise dates
  {
    prompt: 'Find exact calendar due dates for the major assignments. If exact dates are not listed, say exact dates not found and identify what is listed instead.',
    minToolCalls: 2,
    requireTools: ['ls'],
    requireAnyOf: [['grep', 'read']],
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

// Build the unified plain-text view of the syllabus PDF — same shape as
// AIRetrievalService.loadFileText: every page joined with `[page N]`
// markers as their own lines, 1-indexed across the file.
const FILE_LINES = (() => {
  const out = [];
  for (const p of pages) {
    out.push(`[page ${p.pageNumber}]`);
    for (const line of (p.text || '').split('\n')) out.push(line);
  }
  return out;
})();
const TOTAL_LINES = FILE_LINES.length;
const HAS_PAGES = pages.length > 0;

function nearestPrecedingPage(targetLine /* 1-indexed */) {
  let best = null;
  let bestStart = -1;
  let cursor = 0;
  for (const p of pages) {
    cursor += 1; // marker line
    if (cursor <= targetLine && cursor > bestStart) {
      best = p.pageNumber;
      bestStart = cursor;
    }
    cursor += (p.text || '').split('\n').length;
  }
  return best;
}

// ── Tool registry — schema mirrors AIRetrievalService.tools (#70) ──────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'ls',
      description:
        'List uploaded reference files attached to the current chat. Returns [{ id, filename }] in upload order. Call first when you need to know what is available; idempotent and cheap.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description:
        'Case-insensitive literal substring search over one file. Returns up to 50 matches in document order with { line, page, text, contextLines? }. Use context_before / context_after to pull surrounding lines without an extra read. Pattern is plain text — no regex.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string', description: 'File id from ls().' },
          pattern: { type: 'string', description: 'Literal substring to match, case-insensitive. No regex.' },
          context_before: { type: 'integer', description: 'Lines before each match. Default 0.' },
          context_after: { type: 'integer', description: 'Lines after each match. Default 0.' },
        },
        required: ['file', 'pattern', 'context_before', 'context_after'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read',
      description:
        'Read a contiguous line range from one file. Returns { lines: [{ line, text }], totalLines, hasPages, pageRange?, truncated? }. offset is the 1-indexed first line; limit is the max number of lines to return (default 200, hard cap 800). Lines are returned in full — never character-truncated. PDF [page N] markers appear as their own lines; cite them when answering.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string', description: 'File id from ls().' },
          offset: { type: 'integer', description: '1-indexed start line. Default 1.' },
          limit: { type: 'integer', description: 'Max lines to return. Default 200.' },
        },
        required: ['file', 'offset', 'limit'],
      },
    },
  },
];

// ── Tool dispatcher ───────────────────────────────────────────────────────
//
// (lsFiles / grepFile / readFile defined above next to FILE_LINES.)

function lsFiles() {
  return { files: [{ id: MOCK_PAPER_ID, filename: MOCK_PAPER_TITLE }] };
}

function grepFile(fileId, pattern, contextBefore, contextAfter) {
  if (fileId !== MOCK_PAPER_ID) return { file: fileId, matches: [], error: 'unknown file' };
  if (!pattern || typeof pattern !== 'string') return { file: fileId, matches: [], error: 'pattern required' };
  const before = Math.max(0, Math.min(20, Math.floor(contextBefore ?? 0)));
  const after = Math.max(0, Math.min(20, Math.floor(contextAfter ?? 0)));
  const needle = pattern.toLowerCase();
  const cap = 50;
  const matches = [];
  for (let i = 0; i < FILE_LINES.length && matches.length < cap; i++) {
    if (!FILE_LINES[i].toLowerCase().includes(needle)) continue;
    const line1 = i + 1;
    const ctxStart = Math.max(0, i - before);
    const ctxEnd = Math.min(FILE_LINES.length, i + after + 1);
    const contextLines = (before > 0 || after > 0)
      ? Array.from({ length: ctxEnd - ctxStart }, (_, k) => ({
          line: ctxStart + k + 1,
          text: FILE_LINES[ctxStart + k],
          isMatch: ctxStart + k === i,
        }))
      : undefined;
    matches.push({
      line: line1,
      page: nearestPrecedingPage(line1),
      text: FILE_LINES[i],
      ...(contextLines ? { contextLines } : {}),
    });
  }
  return {
    file: fileId,
    pattern,
    truncated: matches.length === cap,
    matchCount: matches.length,
    matches,
  };
}

function readFile(fileId, offset, limit) {
  if (fileId !== MOCK_PAPER_ID) return { file: fileId, lines: [], error: 'unknown file' };
  const offsetN = Math.max(1, Math.floor(offset ?? 1));
  const limitN = Math.max(1, Math.min(800, Math.floor(limit ?? 200)));
  const startIdx = offsetN - 1;
  const endIdx = Math.min(FILE_LINES.length, startIdx + limitN);
  const slice = FILE_LINES.slice(startIdx, endIdx);
  const startPage = HAS_PAGES ? nearestPrecedingPage(offsetN) : null;
  const endPage = HAS_PAGES && endIdx > 0 ? nearestPrecedingPage(endIdx) : null;
  return {
    file: fileId,
    offset: offsetN,
    limit: limitN,
    totalLines: TOTAL_LINES,
    hasPages: HAS_PAGES,
    pageRange: HAS_PAGES ? { start: startPage, end: endPage } : null,
    truncated: endIdx < FILE_LINES.length,
    lines: slice.map((text, i) => ({ line: startIdx + i + 1, text })),
  };
}

async function executeTool(name, args) {
  switch (name) {
    case 'ls':
      return lsFiles();
    case 'grep':
      return grepFile(args.file, args.pattern, args.context_before, args.context_after);
    case 'read':
      return readFile(args.file, args.offset, args.limit);
    default:
      return { error: `unknown tool "${name}". Available tools: ls, grep, read.` };
  }
}

// ── Agent loop ────────────────────────────────────────────────────────────

const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

const SYSTEM_PROMPT = `You are an AI writing assistant. You answer questions about uploaded reference files using three primitives:

  ls()                                              — list files: [{ id, filename }]
  grep(file, pattern, context_before?, context_after?) — case-insensitive substring search
                                                       returns up to 50 matches in document order, each
                                                       { line, page (nearest preceding [page N], or null),
                                                         text, contextLines? }
  read(file, offset?, limit?)                       — read a contiguous line range
                                                       returns { lines, totalLines, hasPages, pageRange?, truncated? }
                                                       offset 1-indexed (default 1); limit default 200, hard cap 800

PRIVACY BOUNDARY (hard rule):
You can only see files in ls(). You CANNOT read the user's editor draft, their current writing, selected text, or anything not in ls(). The schema does not expose such a tool. If the user asks for editor content ("summarize my draft", "find a typo in what I wrote"), refuse honestly:

  "I can only read reference files you've uploaded. For your own writing, paste it into chat or use the selection-menu Quick Actions."

STRATEGY HINTS — adapt to file size and question, no fixed workflow:
- Always call ls() first if you have not yet seen what is attached.
- Small file (≤200 lines): one read({ file, offset:1, limit:200 }) usually beats grep.
- Medium file (200–1000 lines): grep first to locate, then read targeted range.
- Large file (>1000 lines): always grep first, never read sequentially.
- For PDFs the [page N] markers appear inline — cite them ("see page 21").
- For late-document sections (conclusion / references / appendix on a long PDF), read at high offset is often faster than guessing keywords.

FALLBACK LADDER — keep trying before answering "not found":
1. grep returned []? Try a synonym, then a shorter substring, then a numbered-heading style ("Conclusion" → "5. Conclusion"), then read the likely region directly.
2. read returned content that doesn't answer? grep with a better pattern or read an adjacent range.
3. ls returned []? Tell the user no files are attached. Don't pretend.
4. Tool errored? Retry once. If still failing, surface the error honestly.
5. Only after 3-4 reasonable attempts: "I could not find X in <filename>. Could you point me at a specific page or term?" Never fabricate.

OUTPUT:
- Cite by [page N] when present, otherwise by line.
- Tool calls must be REAL structured function calls. Never write XML, DSML, JSON snippets like {"function":"ls","arguments":{}}, pseudo-tags, or prose tool calls.`;

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

function shouldRepairEmptyToolCallResponse(finishReason, toolCalls) {
  return (finishReason === 'tool_calls' || finishReason === 'function_call') && toolCalls.length === 0;
}

function buildToolCallRepairPrompt() {
  return `Internal tool-call repair instruction:
The previous model response attempted a tool call but did not include a valid structured tool_calls payload. Do not answer from memory.

Retry by emitting exactly one or more valid tool calls using JSON arguments. The available tools are:
- ls() — pass {} as arguments.
- grep — pass {"file":"<id from ls>","pattern":"...","context_before":0,"context_after":0}.
- read — pass {"file":"<id from ls>","offset":1,"limit":200}.

Do not write XML, DSML, JSON snippets like {"function":"ls","arguments":{}}, pseudo-tags, or prose tool calls.`;
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
  let emptyToolCallRepairAttempts = 0;

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
      if (shouldRepairEmptyToolCallResponse(finishReason, toolCalls)) {
        if (emptyToolCallRepairAttempts < 1) {
          emptyToolCallRepairAttempts += 1;
          emit({ type: 'thinking-delta', text: 'Retrying retrieval because the provider returned an empty tool-call response.' });
          messages.push({ role: 'user', content: buildToolCallRepairPrompt() });
          emit({ type: 'turn-end', turnIndex, finishReason });
          continue;
        }

        emit({ type: 'error', message: 'Provider returned finish_reason=tool_calls without a valid tool_calls payload after repair retry.' });
        emit({ type: 'turn-end', turnIndex, finishReason });
        break;
      }

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
  const value = text || '';
  return [
    /<\s*tool_call\b/i,
    /<\s*tool_use\b/i,
    /<\s*function\s*=/i,
    /<\s*parameter\s*=/i,
    /<\s*(?:\uFF5C\s*)?DSML\s*[\uFF5C|]\s*tool_calls\b/i,
    /\{\s*"(?:function|name)"\s*:\s*"(?:ls|grep|read)"\s*,\s*"arguments"\s*:/i,
  ].some((pattern) => pattern.test(value));
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
  for (const group of promptCase.requireAnyOf || []) {
    if (!group.some((t) => calledTools.has(t))) {
      failures.push(`Prompt ${promptNumber}: expected at least one of [${group.join(', ')}] to be called`);
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
