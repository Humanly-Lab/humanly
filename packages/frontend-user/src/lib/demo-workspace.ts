'use client';

import {
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  normalizeCopyPastePolicy,
  normalizeResourceAccessPolicy,
  normalizeWritingAiAccess,
  normalizeWritingDetectorConfig,
  type AppFile,
  type AuthorshipComposition,
  type Certificate,
  type CertificateGenerationOptions,
  type CertificateSeal,
  type CertificateSealStatus,
  type Document,
  type DocumentEventTimelineItem,
  type DocumentEventTimelineRawEvent,
  type DocumentEventTimelineResponse,
  type DocumentEventTimelineSummary,
  type WritingEnvironmentConfig,
} from '@humanly/shared';

const STORAGE_PREFIX = 'humanly:demo-workspace:';
const DOCUMENT_PREFIX = `${STORAGE_PREFIX}document:`;
const CERTIFICATE_PREFIX = `${STORAGE_PREFIX}certificate:`;
const DEMO_DOCUMENT_PREFIX = 'demo-doc-';
const DEMO_CERTIFICATE_PREFIX = 'demo-cert-';
const DEMO_USER_ID = 'demo-user-local';
const MAX_STORED_EVENTS = 2000;
let fallbackIdCounter = 0;

export interface DemoPdfSource {
  name: string;
  size: number;
  previewUrl?: string;
}

interface DemoDocumentRecord {
  document: Document;
  linkedFile: AppFile | null;
  events: DemoStoredEvent[];
  certificateIds: string[];
}

interface DemoCertificateRecord {
  certificate: Certificate;
  seal: CertificateSeal;
  sealStatus: CertificateSealStatus;
  integrityMessage: string;
}

type DemoStoredEvent = {
  sessionId?: string | null;
  eventType: string;
  timestamp: string;
  keyCode?: string;
  keyChar?: string;
  textBefore?: string;
  textAfter?: string;
  cursorPosition?: number;
  selectionStart?: number;
  selectionEnd?: number;
  editorStateBefore?: unknown;
  editorStateAfter?: unknown;
  metadata?: Record<string, any>;
};

export function isDemoDocumentId(documentId?: string | null): boolean {
  return Boolean(documentId?.startsWith(DEMO_DOCUMENT_PREFIX));
}

export function isDemoCertificateId(certificateId?: string | null): boolean {
  return Boolean(certificateId?.startsWith(DEMO_CERTIFICATE_PREFIX));
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function makeId(prefix: string): string {
  fallbackIdCounter += 1;
  return `${prefix}${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

function readJson<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Demo mode is best-effort local state; avoid blocking the visible flow.
  }
}

function documentKey(documentId: string) {
  return `${DOCUMENT_PREFIX}${documentId}`;
}

function certificateKey(certificateId: string) {
  return `${CERTIFICATE_PREFIX}${certificateId}`;
}

function normalizeEnvironmentConfig(config?: WritingEnvironmentConfig | null): WritingEnvironmentConfig {
  const source = config || DEFAULT_WRITING_ENVIRONMENT_CONFIG;
  return {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    ...source,
    taskType: 'personal',
    aiAccess: normalizeWritingAiAccess(source.aiAccess),
    copyPastePolicy: normalizeCopyPastePolicy(source.copyPastePolicy),
    resourceAccess: normalizeResourceAccessPolicy(source.resourceAccess),
    detectors: normalizeWritingDetectorConfig(source.detectors),
    instructions: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.instructions,
      ...(source.instructions || {}),
    },
    traceability: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.traceability,
      ...(source.traceability || {}),
    },
    submission: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.submission,
      ...(source.submission || {}),
    },
    time: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.time,
      ...(source.time || {}),
    },
    aiTokenBudget: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.aiTokenBudget,
      ...(source.aiTokenBudget || {}),
    },
    aiUsageLimit: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.aiUsageLimit,
      ...(source.aiUsageLimit || {}),
    },
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getEventTimestamp(event: Record<string, any>): string {
  const value: unknown = event.timestamp;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }
  return new Date().toISOString();
}

function normalizeStoredEvent(event: Record<string, any>): DemoStoredEvent {
  return {
    sessionId: event.sessionId || undefined,
    eventType: String(event.eventType || 'event'),
    timestamp: getEventTimestamp(event),
    keyCode: event.keyCode,
    keyChar: event.keyChar,
    textBefore: typeof event.textBefore === 'string' ? event.textBefore : undefined,
    textAfter: typeof event.textAfter === 'string' ? event.textAfter : undefined,
    cursorPosition: typeof event.cursorPosition === 'number' ? event.cursorPosition : undefined,
    selectionStart: typeof event.selectionStart === 'number' ? event.selectionStart : undefined,
    selectionEnd: typeof event.selectionEnd === 'number' ? event.selectionEnd : undefined,
    editorStateBefore: event.editorStateBefore,
    editorStateAfter: event.editorStateAfter,
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : undefined,
  };
}

function getPositiveTextDelta(event: DemoStoredEvent): number {
  if (typeof event.textBefore === 'string' && typeof event.textAfter === 'string') {
    return Math.max(0, event.textAfter.length - event.textBefore.length);
  }
  if (typeof event.metadata?.insertedText === 'string') return event.metadata.insertedText.length;
  if (typeof event.keyChar === 'string') return event.keyChar.length;
  return 0;
}

function getNegativeTextDelta(event: DemoStoredEvent): number {
  if (typeof event.textBefore === 'string' && typeof event.textAfter === 'string') {
    return Math.max(0, event.textBefore.length - event.textAfter.length);
  }
  if (typeof event.metadata?.deletedText === 'string') return event.metadata.deletedText.length;
  return 0;
}

function getInsertedText(event: DemoStoredEvent): string {
  if (typeof event.metadata?.insertedText === 'string') return event.metadata.insertedText;
  if (typeof event.metadata?.pastedText === 'string') return event.metadata.pastedText;
  if (typeof event.keyChar === 'string') return event.keyChar;
  if (typeof event.textBefore === 'string' && typeof event.textAfter === 'string') {
    const delta = event.textAfter.length - event.textBefore.length;
    if (delta > 0) return event.textAfter.slice(Math.max(0, event.cursorPosition || event.textAfter.length) - delta, event.cursorPosition || event.textAfter.length);
  }
  return '';
}

function getEventKind(event: DemoStoredEvent): DocumentEventTimelineItem['kind'] {
  if (event.eventType === 'paste') return 'paste';
  if (event.eventType.startsWith('ai_')) return 'ai_insert';
  if (event.eventType === 'delete' || event.keyCode === 'Backspace' || event.keyCode === 'Delete' || getNegativeTextDelta(event) > 0) {
    return 'delete';
  }
  if (event.eventType === 'input' || event.eventType === 'keydown') return 'typing_burst';
  if (event.eventType === 'line_break') return 'line_break';
  return 'event';
}

function buildTimelineItem(event: DemoStoredEvent, index: number): DocumentEventTimelineItem {
  const rawEvent: DocumentEventTimelineRawEvent = {
    id: `demo-raw-${index}`,
    eventType: event.eventType as DocumentEventTimelineRawEvent['eventType'],
    timestamp: event.timestamp,
    keyCode: event.keyCode,
    keyChar: event.keyChar,
    cursorPosition: event.cursorPosition,
    selectionStart: event.selectionStart,
    selectionEnd: event.selectionEnd,
    metadata: event.metadata,
  };
  const kind = getEventKind(event);
  const insertedText = getInsertedText(event);
  const deletedCharacters = getNegativeTextDelta(event);
  const charCount = kind === 'delete' ? deletedCharacters : getPositiveTextDelta(event);

  return {
    id: `demo-item-${index}`,
    kind,
    label: kind === 'event' ? event.eventType.replace(/[_-]+/g, ' ') : kind,
    timestamp: event.timestamp,
    startTimestamp: event.timestamp,
    endTimestamp: event.timestamp,
    sessionId: event.sessionId || undefined,
    text: insertedText,
    charCount,
    wordCount: countWords(insertedText),
    cursorStart: event.selectionStart,
    cursorEnd: event.selectionEnd,
    rawEventCount: 1,
    rawEvents: [rawEvent],
    metadata: {
      ...(event.metadata || {}),
      ...(kind === 'delete' && deletedCharacters ? { deletedCharacters } : {}),
    },
  };
}

function summarizeTimeline(events: DemoStoredEvent[], items: DocumentEventTimelineItem[]): DocumentEventTimelineSummary {
  const typedCharacters = events
    .filter((event) => getEventKind(event) === 'typing_burst')
    .reduce((total, event) => total + getPositiveTextDelta(event), 0);
  const pasteCharacters = events
    .filter((event) => getEventKind(event) === 'paste')
    .reduce((total, event) => total + getPositiveTextDelta(event), 0);
  const deletedCharacters = events.reduce((total, event) => total + getNegativeTextDelta(event), 0);

  return {
    rawEventTotal: events.length,
    timelineItemTotal: items.length,
    typingBursts: items.filter((item) => item.kind === 'typing_burst').length,
    typedCharacters,
    typedWords: 0,
    pasteCharacters,
    deletedCharacters,
  };
}

function readDemoRecord(documentId: string): DemoDocumentRecord | null {
  return readJson<DemoDocumentRecord>(documentKey(documentId));
}

function writeDemoRecord(record: DemoDocumentRecord): void {
  writeJson(documentKey(record.document.id), record);
}

export function createDemoDocument(input: {
  title: string;
  description?: string;
  environmentConfig?: WritingEnvironmentConfig | null;
  pdf?: DemoPdfSource | null;
}): Document {
  const now = new Date().toISOString();
  const documentId = makeId(DEMO_DOCUMENT_PREFIX);
  const title = input.title.trim() || 'Demo Writing';
  const linkedFile = input.pdf
    ? {
        id: makeId('demo-pdf-'),
        ownerUserId: DEMO_USER_ID,
        documentId,
        purpose: 'document_source_pdf' as const,
        title: input.pdf.name,
        originalFilename: input.pdf.name,
        mimeType: 'application/pdf',
        storageProvider: 'browser-local',
        storageKey: input.pdf.previewUrl || '',
        storageBucket: null,
        storageRegion: null,
        storageEtag: null,
        fileSize: input.pdf.size,
        checksum: 'demo-local',
        pageCount: null,
        uploadStatus: 'ready' as const,
        textIndexStatus: 'unavailable' as const,
        legacySourceId: null,
        createdAt: now as unknown as Date,
        updatedAt: now as unknown as Date,
      }
    : null;
  const document: Document = {
    id: documentId,
    userId: DEMO_USER_ID,
    title,
    description: input.description?.trim() || null,
    content: {},
    plainText: '',
    status: 'draft',
    version: 1,
    wordCount: 0,
    characterCount: 0,
    finalTextCharacterCount: 0,
    environmentConfig: normalizeEnvironmentConfig(input.environmentConfig),
    writingStartedAt: null,
    createdAt: now as unknown as Date,
    updatedAt: now as unknown as Date,
    lastEditedAt: now as unknown as Date,
  };

  writeDemoRecord({
    document,
    linkedFile,
    events: [
      {
        eventType: 'demo_document_created',
        timestamp: now,
        metadata: {
          title,
          localOnly: true,
        },
      },
    ],
    certificateIds: [],
  });

  return document;
}

export function getDemoDocument(documentId: string): { document: Document; linkedFile: AppFile | null } | null {
  const record = readDemoRecord(documentId);
  return record ? { document: record.document, linkedFile: record.linkedFile } : null;
}

export function updateDemoDocument(
  documentId: string,
  content: Record<string, any>,
  plainText: string,
  title?: string
): Document | null {
  const record = readDemoRecord(documentId);
  if (!record) return null;

  const now = new Date().toISOString();
  record.document = {
    ...record.document,
    ...(title !== undefined ? { title } : {}),
    content,
    plainText,
    wordCount: countWords(plainText),
    characterCount: plainText.length,
    finalTextCharacterCount: plainText.length,
    version: record.document.version + 1,
    updatedAt: now as unknown as Date,
    lastEditedAt: now as unknown as Date,
  };
  writeDemoRecord(record);
  return record.document;
}

export function startDemoWritingSession(documentId: string): Document | null {
  const record = readDemoRecord(documentId);
  if (!record) return null;
  if (!record.document.writingStartedAt) {
    record.document = {
      ...record.document,
      writingStartedAt: new Date().toISOString() as unknown as Date,
    };
    writeDemoRecord(record);
  }
  return record.document;
}

export function appendDemoEvents(documentId: string, events: Array<Record<string, any>>): void {
  if (!events.length) return;
  const record = readDemoRecord(documentId);
  if (!record) return;

  record.events = [
    ...record.events,
    ...events.map(normalizeStoredEvent),
  ].slice(-MAX_STORED_EVENTS);
  writeDemoRecord(record);
}

export function getDemoTimeline(documentId: string): DocumentEventTimelineResponse | null {
  const record = readDemoRecord(documentId);
  if (!record) return null;
  const events = record.events;
  const items = events.map(buildTimelineItem);
  return {
    items,
    summary: summarizeTimeline(events, items),
  };
}

function getEditingTimeSeconds(events: DemoStoredEvent[]): number {
  if (events.length < 2) return 0;
  const times = events
    .map((event) => new Date(event.timestamp).getTime())
    .filter((time) => Number.isFinite(time));
  if (times.length < 2) return 0;
  return Math.max(0, Math.round((Math.max(...times) - Math.min(...times)) / 1000));
}

function buildComposition(typedCharacters: number, pastedCharacters: number): AuthorshipComposition {
  return {
    typedCharacters,
    pastedCharacters,
    aiAssistedCharacters: 0,
    aiAssistedByType: {
      chatInsert: 0,
      chatPaste: 0,
      grammar: 0,
      improve: 0,
      simplify: 0,
      formal: 0,
      other: 0,
    },
  };
}

function makeDemoSeal(certificateId: string, documentId: string): CertificateSeal {
  return {
    version: 'demo-local-v1',
    algorithm: 'local-demo-reference-only',
    keyId: 'humanly-demo-local-reference-only',
    publicKeyFingerprint: 'demo-local-not-publicly-verifiable',
    payloadHash: `demo-${documentId.slice(-12)}-${certificateId.slice(-12)}`,
    signature: 'demo-local-preview-only',
    signedFields: ['demoDocumentId', 'demoCertificateId', 'demoGeneratedAt'],
  };
}

export function generateDemoCertificate(
  documentId: string,
  options: Partial<CertificateGenerationOptions> = {}
): Certificate | null {
  const record = readDemoRecord(documentId);
  if (!record) return null;

  const now = new Date().toISOString();
  const certificateId = makeId(DEMO_CERTIFICATE_PREFIX);
  const timeline = getDemoTimeline(documentId);
  const summary = timeline?.summary || summarizeTimeline([], []);
  const totalCharacters = record.document.plainText.length;
  const pastedCharacters = summary.pasteCharacters;
  const typedCharacters = summary.typedCharacters > 0
    ? summary.typedCharacters
    : Math.max(totalCharacters - pastedCharacters, 0);
  const composition = buildComposition(typedCharacters, pastedCharacters);
  const finalTextSource = pastedCharacters > typedCharacters ? 'pasted' : 'typed';
  const certificate: Certificate = {
    id: certificateId,
    submissionId: null,
    documentId,
    userId: DEMO_USER_ID,
    certificateType: options.certificateType || 'full_authorship',
    status: 'active',
    title: record.document.title,
    documentSnapshot: record.document.content,
    plainTextSnapshot: record.document.plainText,
    totalEvents: summary.rawEventTotal,
    typingEvents: record.events.filter((event) => event.eventType === 'input' || event.eventType === 'keydown').length,
    pasteEvents: record.events.filter((event) => event.eventType === 'paste').length,
    totalCharacters,
    typedCharacters,
    pastedCharacters,
    finalTextComposition: composition,
    finalTextSourceSpans: record.document.plainText
      ? [{ source: finalTextSource, text: record.document.plainText }]
      : [],
    processInputVolume: composition,
    editingTimeSeconds: getEditingTimeSeconds(record.events),
    anomalyFlags: [],
    detectorResults: {
      anomalyPattern: {
        enabled: normalizeWritingDetectorConfig(record.document.environmentConfig?.detectors).anomalyPattern.enabled,
        status: 'pass',
        flags: [],
        generatedAt: now,
      },
      humanTyping: {
        enabled: normalizeWritingDetectorConfig(record.document.environmentConfig?.detectors).humanTyping.enabled,
        status: 'unknown',
        result: {
          ok: true,
          label: 'unknown',
          reason: 'Demo mode uses browser-local preview data only.',
        },
        spec: null,
        error: null,
        generatedAt: now,
      },
    },
    policyHash: null,
    signature: 'demo-local-preview-only',
    verificationToken: `demo-local-${certificateId}`,
    signerName: options.signerName || null,
    includeFullText: options.includeFullText !== false,
    includeEditHistory: options.includeEditHistory !== false,
    isProtected: false,
    accessCode: null,
    accessCodeHash: null,
    generatedAt: now as unknown as Date,
    pdfGenerated: false,
    pdfUrl: null,
    jsonUrl: null,
    createdAt: now as unknown as Date,
    environmentConfig: record.document.environmentConfig,
  };

  writeJson<DemoCertificateRecord>(certificateKey(certificateId), {
    certificate,
    seal: makeDemoSeal(certificateId, documentId),
    sealStatus: 'missing',
    integrityMessage: 'Demo certificate only. This preview is generated locally for reference and is not publicly verifiable.',
  });

  record.certificateIds = [certificateId, ...record.certificateIds];
  writeDemoRecord(record);
  return certificate;
}

export function getDemoCertificate(certificateId: string): DemoCertificateRecord | null {
  return readJson<DemoCertificateRecord>(certificateKey(certificateId));
}
