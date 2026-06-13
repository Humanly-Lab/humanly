#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
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
} from "./lib/qa-report.mjs";

const DEFAULT_BASE_URL = "http://localhost:3001/api/v1";
const DEFAULT_PARTICIPANT_COUNT = 10;
const DEFAULT_EVENT_COUNT = 4;
const MAX_DEFAULT_PARTICIPANTS = 20;

function showHelp() {
  console.log(`Humanly submit concurrency QA harness

Usage:
  QA_SUBMIT_CONCURRENCY_EXECUTE=1 \\
  QA_SUBMIT_CONCURRENCY_PUBLIC_TOKEN=<task share token> \\
  pnpm qa:submit:concurrency

Self-contained QA task mode:
  QA_SUBMIT_CONCURRENCY_EXECUTE=1 \\
  QA_SUBMIT_CONCURRENCY_CREATE_TASK=1 \\
  QA_SUBMIT_CONCURRENCY_ADMIN_ACCESS_TOKEN=<verified admin access token> \\
  pnpm qa:submit:concurrency -- --count=20

Environment / flags:
  QA_SUBMIT_CONCURRENCY_BASE_URL / --base-url
      API base URL, with or without /api/v1. Defaults to local backend.
  QA_SUBMIT_CONCURRENCY_EXECUTE=1 / --execute
      Required. This harness creates guest users, documents, events, submissions,
      certificates, and optionally a temporary task.
  QA_SUBMIT_CONCURRENCY_PUBLIC_TOKEN / --public-token
      Existing public task share token to test.
  QA_SUBMIT_CONCURRENCY_CREATE_TASK=1 / --create-task
      Create a temporary open QA task. Requires admin access token/storageState.
  QA_SUBMIT_CONCURRENCY_ADMIN_ACCESS_TOKEN / --admin-access-token
      Verified admin token for creating temporary tasks and admin readback.
  QA_SUBMIT_CONCURRENCY_ADMIN_STORAGE_STATE / --admin-storage-state
      Playwright storageState JSON containing localStorage accessToken.
  QA_SUBMIT_CONCURRENCY_COUNT / --count
      Number of simultaneous guest submissions. Defaults to 10; 20 is the normal
      upper bound. Use --allow-large only for disposable environments.
  QA_SUBMIT_CONCURRENCY_KEEP_DATA=1 / --keep-data
      Keep a temporary task created by --create-task. Existing public tasks are
      never deleted by this harness.
  QA_OUTPUT_DIR / --output-dir
      Report output directory.
  --self-test-fixtures
      Run non-mutating fixture checks for the harness event clock.

The harness follows the real share-link path:
  public guest start -> task document -> submission session -> document events
  -> concurrent enrollment submit -> admin submissions / event parity checks.

Tokens, cookies, passwords, and raw storageState values are never written to the
QA report.
`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
  process.exit(0);
}

const baseUrl = normalizeApiBaseUrl(
  arg("base-url", process.env.QA_SUBMIT_CONCURRENCY_BASE_URL),
  DEFAULT_BASE_URL,
);
const execute =
  boolArg("execute", "QA_SUBMIT_CONCURRENCY_EXECUTE", false) ||
  boolArg("mutating", "QA_SUBMIT_CONCURRENCY_MUTATING", false);
const createTask = boolArg(
  "create-task",
  "QA_SUBMIT_CONCURRENCY_CREATE_TASK",
  false,
);
const keepData = boolArg("keep-data", "QA_SUBMIT_CONCURRENCY_KEEP_DATA", false);
const allowLarge = boolArg(
  "allow-large",
  "QA_SUBMIT_CONCURRENCY_ALLOW_LARGE",
  false,
);
const requestedParticipantCount = Number.parseInt(
  arg("count", process.env.QA_SUBMIT_CONCURRENCY_COUNT) ||
    String(DEFAULT_PARTICIPANT_COUNT),
  10,
);
const participantCount =
  Number.isFinite(requestedParticipantCount) && requestedParticipantCount > 0
    ? requestedParticipantCount
    : DEFAULT_PARTICIPANT_COUNT;
const parsedEventCount = Number.parseInt(
  arg("event-count", process.env.QA_SUBMIT_CONCURRENCY_EVENT_COUNT) ||
    String(DEFAULT_EVENT_COUNT),
  10,
);
const eventCount = Math.min(
  DEFAULT_EVENT_COUNT,
  Math.max(
    1,
    Number.isFinite(parsedEventCount) ? parsedEventCount : DEFAULT_EVENT_COUNT,
  ),
);
let publicToken = arg(
  "public-token",
  process.env.QA_SUBMIT_CONCURRENCY_PUBLIC_TOKEN,
);
const suppliedAdminAccessToken = arg(
  "admin-access-token",
  process.env.QA_SUBMIT_CONCURRENCY_ADMIN_ACCESS_TOKEN,
);
const adminStorageStatePath = arg(
  "admin-storage-state",
  process.env.QA_SUBMIT_CONCURRENCY_ADMIN_STORAGE_STATE,
);

const report = createQaRun({
  layer: "submit-concurrency",
  title: "Submit Concurrency Harness",
  config: {
    baseUrl,
    execute,
    createTask,
    keepData,
    participantCount,
    eventCount,
    hasPublicToken: Boolean(publicToken),
    hasAdminAccessToken: Boolean(suppliedAdminAccessToken),
    hasAdminStorageState: Boolean(adminStorageStatePath),
  },
});

let adminAccessToken = null;
let taskId = null;
let createdTaskId = null;
let createdTaskName = null;
let participants = [];
let submitResults = [];
let userEventLogs = new Map();
let adminEventLogs = new Map();

async function finishAndExit() {
  await writeReport(report);
  printReportLocation(report);
  exitForReport(report);
  process.exit();
}

function sanitizeForReport(value) {
  if (Array.isArray(value)) return value.map(sanitizeForReport);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (
        /(token|password|cookie|secret|api[-_]?key|authorization)/i.test(key)
      ) {
        return [key, "[redacted]"];
      }
      return [key, sanitizeForReport(child)];
    }),
  );
}

function formatBody(body) {
  if (!body) return "";
  return ` body=${JSON.stringify(sanitizeForReport(body)).slice(0, 500)}`;
}

function makeRunSlug() {
  return report.run.id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 48);
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

function makeEvents({ participantIndex, sessionId, text, nowMs = Date.now() }) {
  const eventTypes = ["focus", "input", "paste", "blur"];
  const eventWindowStartMs = nowMs - (eventTypes.length + 2) * 1000;
  return eventTypes.slice(0, eventCount).map((eventType, offset) => ({
    eventType,
    timestamp: new Date(eventWindowStartMs + offset * 250).toISOString(),
    keyChar: eventType === "input" ? String(participantIndex % 10) : undefined,
    cursorPosition: text.length,
    textBefore: offset === 0 ? "" : text.slice(0, Math.min(text.length, 24)),
    textAfter: text,
    metadata: {
      qaRun: report.run.id,
      participantIndex,
      sessionId,
      phase: eventType,
    },
  }));
}

function assertFixtureEventClock() {
  const nowMs = Date.parse("2026-06-13T19:00:00.000Z");
  const sampleEvents = makeEvents({
    participantIndex: 20,
    sessionId: "fixture-session",
    text: "Humanly concurrency fixture.",
    nowMs,
  });

  if (sampleEvents.length !== eventCount) {
    throw new Error(
      `Expected ${eventCount} fixture events, got ${sampleEvents.length}.`,
    );
  }

  const timestamps = sampleEvents.map((event) => Date.parse(event.timestamp));
  const futureEvent = timestamps.find((timestamp) => timestamp >= nowMs);
  if (futureEvent !== undefined) {
    throw new Error(
      `Expected fixture events before submit preparation time; got ${new Date(futureEvent).toISOString()} >= ${new Date(nowMs).toISOString()}.`,
    );
  }

  const nonMonotonicIndex = timestamps.findIndex(
    (timestamp, index) => index > 0 && timestamp <= timestamps[index - 1],
  );
  if (nonMonotonicIndex !== -1) {
    throw new Error(
      `Expected fixture events to be strictly increasing at index ${nonMonotonicIndex}.`,
    );
  }
}

if (process.argv.includes("--self-test-fixtures")) {
  assertFixtureEventClock();
  console.log("Submit concurrency fixture self-test passed.");
  process.exit(0);
}

function makeNoAiAdminAssignedEnvironment(startDate, endDate) {
  return {
    preset: "no_ai",
    taskType: "admin_assigned",
    description: "QA submit concurrency task.",
    instructions: {
      hasInstructionPdf: false,
      editableAfterSubmission: false,
    },
    aiAccess: "off",
    allowedModels: [],
    customModels: [],
    aiTokenBudget: {
      shortcutMaxTokens: 1024,
      chatMaxTokens: 4096,
    },
    aiPolicy: {
      mode: "off",
    },
    aiUsageLimit: {
      mode: "max_requests",
      maxRequests: 1000000,
    },
    time: {
      startTime: startDate,
      endTime: endDate,
      lateSubmission: "not_allowed",
    },
    submission: {
      mode: "single",
    },
    traceability: {
      trackAiUsage: false,
      trackTyping: true,
      trackCopyPaste: true,
      trackFocusBlur: true,
    },
    resourceAccess: "downloadable",
    copyPastePolicy: "allowed",
  };
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
    if (tokenEntry?.value) return tokenEntry.value;
  }

  throw new Error(
    `No accessToken localStorage entry found in storageState for ${baseOrigin}`,
  );
}

async function startGuestParticipant(index) {
  const sessionSuffix = crypto.randomBytes(4).toString("hex");
  const publicSessionId = `qa-${makeRunSlug()}-${index}-${sessionSuffix}`.slice(
    0,
    96,
  );
  const { response, body } = await fetchJson(
    joinUrl(baseUrl, `/tasks/public/${publicToken}/start`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "guest",
        sessionId: publicSessionId,
      }),
    },
  );
  const data = body?.data;
  const accessToken = data?.accessToken || null;
  const startedTaskId = data?.task?.id || null;
  const documentId = data?.document?.id || null;
  const userId = data?.user?.id || null;

  if (
    response.status !== 201 ||
    !accessToken ||
    !startedTaskId ||
    !documentId ||
    !userId
  ) {
    throw new Error(
      `Expected guest public start for participant ${index}, got ${response.status}${formatBody(body)}`,
    );
  }

  return {
    index,
    accessToken,
    taskId: startedTaskId,
    documentId,
    userId,
    publicSessionId,
    sessionId: null,
    text: `Humanly concurrency QA ${report.run.id} participant ${index}.`,
  };
}

async function prepareParticipant(participant) {
  const content = makeLexicalContent(participant.text);
  const update = await fetchAuthedJson(
    `/documents/${participant.documentId}`,
    participant.accessToken,
    {
      method: "PUT",
      body: JSON.stringify({
        title: `QA concurrency submission ${participant.index}`,
        content,
        status: "draft",
      }),
    },
  );
  if (update.response.status !== 200) {
    throw new Error(
      `Expected document update for participant ${participant.index}, got ${update.response.status}${formatBody(update.body)}`,
    );
  }

  const session = await fetchAuthedJson(
    `/tasks/enrollments/${participant.taskId}/submission-sessions`,
    participant.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ documentId: participant.documentId }),
    },
  );
  const sessionId = session.body?.data?.sessionId || null;
  if (session.response.status !== 201 || !sessionId) {
    throw new Error(
      `Expected submission session for participant ${participant.index}, got ${session.response.status}${formatBody(session.body)}`,
    );
  }

  const events = makeEvents({
    participantIndex: participant.index,
    sessionId,
    text: participant.text,
  });
  const eventPost = await fetchAuthedJson(
    `/documents/${participant.documentId}/events`,
    participant.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ sessionId, events }),
    },
  );
  if (eventPost.response.status !== 200) {
    throw new Error(
      `Expected document events for participant ${participant.index}, got ${eventPost.response.status}${formatBody(eventPost.body)}`,
    );
  }

  const sessionEnd = await fetchAuthedJson(
    `/tasks/enrollments/${participant.taskId}/submission-sessions/${sessionId}/end`,
    participant.accessToken,
    {
      method: "PUT",
    },
  );
  if (sessionEnd.response.status !== 200) {
    throw new Error(
      `Expected session end for participant ${participant.index}, got ${sessionEnd.response.status}${formatBody(sessionEnd.body)}`,
    );
  }

  return {
    ...participant,
    sessionId,
    expectedEvents: events,
  };
}

async function submitParticipant(participant) {
  const { response, body } = await fetchAuthedJson(
    `/tasks/enrollments/${participant.taskId}/submissions`,
    participant.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ documentId: participant.documentId }),
    },
  );
  const submissionId = body?.data?.submission?.id || null;
  const certificateId = body?.data?.certificate?.id || null;
  const submittedTaskId = body?.data?.submission?.taskId || null;
  const submittedDocumentId = body?.data?.submission?.documentId || null;

  if (
    response.status !== 201 ||
    !submissionId ||
    !certificateId ||
    submittedTaskId !== participant.taskId ||
    submittedDocumentId !== participant.documentId
  ) {
    throw new Error(
      `Expected submission and certificate for participant ${participant.index}, got ${response.status}${formatBody(body)}`,
    );
  }

  return {
    participantIndex: participant.index,
    taskId: participant.taskId,
    userId: participant.userId,
    documentId: participant.documentId,
    submissionId,
    certificateId,
    status: response.status,
  };
}

function extractQaEvents(events, participantIndex) {
  return events.filter(
    (event) =>
      event?.metadata?.qaRun === report.run.id &&
      event?.metadata?.participantIndex === participantIndex,
  );
}

function eventSignature(event) {
  return [
    event.eventType,
    event.metadata?.participantIndex,
    event.metadata?.phase,
    event.metadata?.sessionId,
  ].join(":");
}

function compareEventSequences(userEvents, adminEvents) {
  const userSignatures = userEvents.map(eventSignature).sort();
  const adminSignatures = adminEvents.map(eventSignature).sort();
  return JSON.stringify(userSignatures) === JSON.stringify(adminSignatures);
}

if (!execute) {
  addCheck(report, {
    id: "execution-precondition",
    title: "Mutating submit concurrency execution is opt-in",
    target: baseUrl,
    status: "skip",
    details: {
      reason:
        "Set QA_SUBMIT_CONCURRENCY_EXECUTE=1 or pass --execute to create guest users, documents, events, submissions, and certificates.",
      examples: [
        "QA_SUBMIT_CONCURRENCY_EXECUTE=1 QA_SUBMIT_CONCURRENCY_PUBLIC_TOKEN=<token> pnpm qa:submit:concurrency",
        "QA_SUBMIT_CONCURRENCY_EXECUTE=1 QA_SUBMIT_CONCURRENCY_CREATE_TASK=1 QA_SUBMIT_CONCURRENCY_ADMIN_ACCESS_TOKEN=<token> pnpm qa:submit:concurrency -- --count=20",
      ],
    },
  });
  await finishAndExit();
}

const participantCountGuard = await runCheck(
  report,
  {
    id: "participant-count-guard",
    title: "Participant count is inside the guarded QA range",
    target: String(participantCount),
  },
  async () => {
    if (participantCount > MAX_DEFAULT_PARTICIPANTS && !allowLarge) {
      throw new Error(
        `Refusing ${participantCount} participants without --allow-large. Use 10 or 20 for normal human-study QA.`,
      );
    }
    return {
      details: {
        participantCount,
        allowLarge,
      },
    };
  },
);
if (participantCountGuard.status === "fail") {
  await finishAndExit();
}

const adminTokenCheck = await runCheck(
  report,
  {
    id: "admin-token",
    title: "Resolve optional verified admin token",
    target: suppliedAdminAccessToken
      ? "adminAccessToken"
      : adminStorageStatePath
        ? "adminStorageState"
        : "not supplied",
    critical: createTask,
  },
  async () => {
    if (suppliedAdminAccessToken) {
      adminAccessToken = suppliedAdminAccessToken;
    } else if (adminStorageStatePath) {
      adminAccessToken = await loadAccessTokenFromStorageState(
        adminStorageStatePath,
        baseUrl,
      );
    }

    if (createTask && !adminAccessToken) {
      throw new Error(
        "Creating a temporary task requires QA_SUBMIT_CONCURRENCY_ADMIN_ACCESS_TOKEN or QA_SUBMIT_CONCURRENCY_ADMIN_STORAGE_STATE.",
      );
    }

    if (!adminAccessToken) {
      return {
        status: "skip",
        details: {
          reason:
            "Admin readback checks will be skipped because no verified admin token/storageState was supplied.",
        },
      };
    }

    const { response, body } = await fetchAuthedJson(
      "/auth/me",
      adminAccessToken,
    );
    if (response.status !== 200 || !body?.data?.user?.id) {
      throw new Error(
        `Expected verified admin /auth/me, got ${response.status}${formatBody(body)}`,
      );
    }
    return {
      details: {
        status: response.status,
        hasAdminAccessToken: true,
        userId: body.data.user.id,
      },
    };
  },
);
if (createTask && adminTokenCheck.status === "fail") {
  await finishAndExit();
}

if (createTask) {
  const createTaskCheck = await runCheck(
    report,
    {
      id: "create-temporary-task",
      title: "Create temporary open QA task",
      target: joinUrl(baseUrl, "/tasks"),
    },
    async () => {
      const startDate = new Date(Date.now() - 60_000).toISOString();
      const endDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      createdTaskName = `QA Submit Concurrency ${report.run.id}`;
      const { response, body } = await fetchAuthedJson(
        "/tasks",
        adminAccessToken,
        {
          method: "POST",
          body: JSON.stringify({
            name: createdTaskName.slice(0, 100),
            description: "Temporary QA task for concurrent guest submissions.",
            startDate,
            endDate,
            allowGuestSubmissions: true,
            environmentConfig: makeNoAiAdminAssignedEnvironment(
              startDate,
              endDate,
            ),
          }),
        },
      );
      const task = body?.data;
      createdTaskId = task?.id || null;
      taskId = createdTaskId;
      publicToken = task?.taskToken || null;
      if (response.status !== 201 || !createdTaskId || !publicToken) {
        throw new Error(
          `Expected temporary task with public token, got ${response.status}${formatBody(body)}`,
        );
      }
      return {
        details: {
          status: response.status,
          taskId,
          taskName: createdTaskName,
          hasPublicToken: true,
        },
      };
    },
  );
  if (createTaskCheck.status === "fail") {
    await finishAndExit();
  }
}

const publicTokenCheck = await runCheck(
  report,
  {
    id: "public-token-precondition",
    title: "Public task share token is available",
    target: publicToken ? "publicToken" : "missing",
  },
  async () => {
    if (!publicToken) {
      throw new Error(
        "Set QA_SUBMIT_CONCURRENCY_PUBLIC_TOKEN or use QA_SUBMIT_CONCURRENCY_CREATE_TASK=1 with admin auth.",
      );
    }
    return { details: { hasPublicToken: true } };
  },
);
if (publicTokenCheck.status === "fail") {
  await finishAndExit();
}

const publicPreviewCheck = await runCheck(
  report,
  {
    id: "public-task-preview",
    title: "Public task link is open for guest start",
    target: joinUrl(baseUrl, `/tasks/public/${publicToken}`),
  },
  async () => {
    const { response, body } = await fetchJson(
      joinUrl(baseUrl, `/tasks/public/${publicToken}`),
    );
    if (
      response.status !== 200 ||
      body?.data?.task?.availabilityStatus !== "open"
    ) {
      throw new Error(
        `Expected open public task, got ${response.status}${formatBody(body)}`,
      );
    }
    return {
      details: {
        status: response.status,
        availabilityStatus: body.data.task.availabilityStatus,
        allowGuestSubmissions: body.data.task.allowGuestSubmissions,
      },
    };
  },
);
if (publicPreviewCheck.status === "fail") {
  await finishAndExit();
}

const prepareParticipantsCheck = await runCheck(
  report,
  {
    id: "prepare-guest-participants",
    title: "Create guest users, documents, sessions, and document events",
    target: joinUrl(baseUrl, `/tasks/public/${publicToken}/start`),
  },
  async () => {
    const started = await Promise.all(
      Array.from({ length: participantCount }, (_, index) =>
        startGuestParticipant(index + 1),
      ),
    );
    const uniqueTaskIds = new Set(
      started.map((participant) => participant.taskId),
    );
    if (uniqueTaskIds.size !== 1) {
      throw new Error(
        `Expected every guest to join the same task, got ${uniqueTaskIds.size} task ids.`,
      );
    }
    taskId = started[0]?.taskId || taskId;

    participants = await Promise.all(started.map(prepareParticipant));
    const documentIds = new Set(
      participants.map((participant) => participant.documentId),
    );
    const userIds = new Set(
      participants.map((participant) => participant.userId),
    );
    const sessionIds = new Set(
      participants.map((participant) => participant.sessionId),
    );

    if (
      documentIds.size !== participantCount ||
      userIds.size !== participantCount ||
      sessionIds.size !== participantCount
    ) {
      throw new Error(
        "Expected one unique guest user, document, and analytics session per participant.",
      );
    }

    return {
      details: {
        taskId,
        participants: participantCount,
        uniqueUsers: userIds.size,
        uniqueDocuments: documentIds.size,
        uniqueSessions: sessionIds.size,
        eventsPerParticipant: eventCount,
      },
    };
  },
);
if (prepareParticipantsCheck.status === "fail") {
  await finishAndExit();
}

const fixtureEventClockCheck = await runCheck(
  report,
  {
    id: "fixture-event-clock",
    title: "Synthetic event timestamps are safely before concurrent submit",
    target: "prepared participant events",
  },
  async () => {
    const nowMs = Date.now();
    const futureEvents = participants.flatMap((participant) =>
      participant.expectedEvents
        .filter((event) => Date.parse(event.timestamp) >= nowMs)
        .map((event) => ({
          participantIndex: participant.index,
          eventType: event.eventType,
          timestamp: event.timestamp,
        })),
    );

    if (futureEvents.length > 0) {
      throw new Error(
        `Expected synthetic events to be timestamped before submit; futureEvents=${JSON.stringify(futureEvents.slice(0, 5))}`,
      );
    }

    return {
      details: {
        participants: participantCount,
        eventsPerParticipant: eventCount,
        latestSyntheticEventAt: participants
          .flatMap((participant) =>
            participant.expectedEvents.map((event) => event.timestamp),
          )
          .sort()
          .at(-1),
        checkedAt: new Date(nowMs).toISOString(),
      },
    };
  },
);
if (fixtureEventClockCheck.status === "fail") {
  await finishAndExit();
}

const concurrentSubmitCheck = await runCheck(
  report,
  {
    id: "concurrent-submit",
    title: "Submit all guest task documents concurrently",
    target: joinUrl(baseUrl, `/tasks/enrollments/${taskId}/submissions`),
  },
  async () => {
    const settled = await Promise.allSettled(
      participants.map((participant) => submitParticipant(participant)),
    );
    const failures = settled.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      throw new Error(
        `Expected all concurrent submissions to succeed; failures=${failures
          .map((result) => result.reason?.message || String(result.reason))
          .join(" | ")}`,
      );
    }

    submitResults = settled.map((result) => result.value);
    const submissionIds = new Set(
      submitResults.map((result) => result.submissionId),
    );
    const certificateIds = new Set(
      submitResults.map((result) => result.certificateId),
    );
    if (
      submissionIds.size !== participantCount ||
      certificateIds.size !== participantCount
    ) {
      throw new Error(
        `Expected unique submission/certificate per participant, got submissions=${submissionIds.size}, certificates=${certificateIds.size}.`,
      );
    }

    return {
      details: {
        participants: participantCount,
        succeeded: submitResults.length,
        uniqueSubmissions: submissionIds.size,
        uniqueCertificates: certificateIds.size,
      },
    };
  },
);
if (concurrentSubmitCheck.status === "fail") {
  await finishAndExit();
}

const userEventLogCheck = await runCheck(
  report,
  {
    id: "user-event-log-readback",
    title: "User-side document event logs include submitted events",
    target: joinUrl(baseUrl, "/documents/:id/events"),
  },
  async () => {
    const reads = await Promise.all(
      participants.map(async (participant) => {
        const { response, body } = await fetchAuthedJson(
          `/documents/${participant.documentId}/events?limit=100`,
          participant.accessToken,
        );
        if (response.status !== 200) {
          throw new Error(
            `Expected user event log for participant ${participant.index}, got ${response.status}${formatBody(body)}`,
          );
        }
        const events = extractQaEvents(
          body?.data?.events || [],
          participant.index,
        );
        if (events.length !== eventCount) {
          throw new Error(
            `Expected ${eventCount} QA events for participant ${participant.index}, got ${events.length}.`,
          );
        }
        userEventLogs.set(participant.index, events);
        return events.length;
      }),
    );

    return {
      details: {
        participants: reads.length,
        eventsPerParticipant: eventCount,
        totalQaEvents: reads.reduce((sum, count) => sum + count, 0),
      },
    };
  },
);
if (userEventLogCheck.status === "fail") {
  await finishAndExit();
}

if (adminAccessToken) {
  await runCheck(
    report,
    {
      id: "admin-submissions-readback",
      title: "Admin submissions include every concurrent submission",
      target: joinUrl(baseUrl, `/tasks/${taskId}/submissions`),
    },
    async () => {
      const { response, body } = await fetchAuthedJson(
        `/tasks/${taskId}/submissions`,
        adminAccessToken,
      );
      if (response.status !== 200) {
        throw new Error(
          `Expected admin submissions readback, got ${response.status}${formatBody(body)}`,
        );
      }
      const submissions = body?.data?.submissions || [];
      const expectedSubmissionIds = new Set(
        submitResults.map((result) => result.submissionId),
      );
      const matched = submissions.filter((submission) =>
        expectedSubmissionIds.has(submission.id),
      );
      const missingCertificates = matched.filter(
        (submission) => !submission.certificateId,
      );
      if (
        matched.length !== participantCount ||
        missingCertificates.length > 0
      ) {
        throw new Error(
          `Expected ${participantCount} admin-visible submissions with certificates, got matched=${matched.length}, missingCertificates=${missingCertificates.length}.`,
        );
      }
      return {
        details: {
          taskId,
          expectedSubmissions: participantCount,
          matchedSubmissions: matched.length,
          taskSubmissionRows: submissions.length,
        },
      };
    },
  );

  await runCheck(
    report,
    {
      id: "admin-event-log-parity",
      title: "Admin submission event logs match user-side event logs",
      target: joinUrl(
        baseUrl,
        `/tasks/${taskId}/submissions/:submissionId/events`,
      ),
    },
    async () => {
      await Promise.all(
        submitResults.map(async (result) => {
          const { response, body } = await fetchAuthedJson(
            `/tasks/${taskId}/submissions/${result.submissionId}/events`,
            adminAccessToken,
          );
          if (response.status !== 200) {
            throw new Error(
              `Expected admin event log for submission ${result.submissionId}, got ${response.status}${formatBody(body)}`,
            );
          }
          const adminEvents = extractQaEvents(
            body?.data?.events || [],
            result.participantIndex,
          );
          const userEvents = userEventLogs.get(result.participantIndex) || [];
          adminEventLogs.set(result.participantIndex, adminEvents);
          if (
            adminEvents.length !== eventCount ||
            !compareEventSequences(userEvents, adminEvents)
          ) {
            throw new Error(
              `Expected admin/user event parity for participant ${result.participantIndex}; user=${userEvents.length}, admin=${adminEvents.length}.`,
            );
          }
        }),
      );

      return {
        details: {
          participants: participantCount,
          eventsPerParticipant: eventCount,
          totalAdminQaEvents: Array.from(adminEventLogs.values()).reduce(
            (sum, events) => sum + events.length,
            0,
          ),
        },
      };
    },
  );

  await runCheck(
    report,
    {
      id: "admin-analytics-summary",
      title: "Admin analytics reflects concurrent document activity",
      target: joinUrl(baseUrl, `/tasks/${taskId}/analytics/summary`),
    },
    async () => {
      const { response, body } = await fetchAuthedJson(
        `/tasks/${taskId}/analytics/summary`,
        adminAccessToken,
      );
      const stats = body?.data || {};
      const minimumEvents = participantCount * eventCount;
      if (
        response.status !== 200 ||
        Number(stats.totalEvents || 0) < minimumEvents ||
        Number(stats.totalSessions || 0) < participantCount ||
        Number(stats.uniqueUsers || 0) < participantCount
      ) {
        throw new Error(
          `Expected analytics totals for concurrent run, got ${response.status}${formatBody(body)}`,
        );
      }
      return {
        details: {
          status: response.status,
          minimumEvents,
          totalEvents: stats.totalEvents,
          totalSessions: stats.totalSessions,
          uniqueUsers: stats.uniqueUsers,
          completionRate: stats.completionRate,
        },
      };
    },
  );

  await runCheck(
    report,
    {
      id: "admin-event-type-summary",
      title: "Admin event type analytics includes concurrent QA events",
      target: joinUrl(baseUrl, `/tasks/${taskId}/analytics/event-types`),
    },
    async () => {
      const { response, body } = await fetchAuthedJson(
        `/tasks/${taskId}/analytics/event-types`,
        adminAccessToken,
      );
      const total = Number(body?.data?.total || 0);
      const minimumEvents = participantCount * eventCount;
      if (response.status !== 200 || total < minimumEvents) {
        throw new Error(
          `Expected event-type total >= ${minimumEvents}, got ${response.status}${formatBody(body)}`,
        );
      }
      return {
        details: {
          status: response.status,
          minimumEvents,
          total,
          eventTypeCount: body?.data?.eventTypes?.length || 0,
        },
      };
    },
  );
} else {
  for (const [id, title, target] of [
    [
      "admin-submissions-readback",
      "Admin submissions include every concurrent submission",
      `/tasks/${taskId}/submissions`,
    ],
    [
      "admin-event-log-parity",
      "Admin submission event logs match user-side event logs",
      `/tasks/${taskId}/submissions/:submissionId/events`,
    ],
    [
      "admin-analytics-summary",
      "Admin analytics reflects concurrent document activity",
      `/tasks/${taskId}/analytics/summary`,
    ],
    [
      "admin-event-type-summary",
      "Admin event type analytics includes concurrent QA events",
      `/tasks/${taskId}/analytics/event-types`,
    ],
  ]) {
    addCheck(report, {
      id,
      title,
      target: joinUrl(baseUrl, target),
      status: "skip",
      details: {
        reason:
          "Skipped because no verified admin access token/storageState was supplied.",
      },
    });
  }
}

if (createdTaskId && adminAccessToken && !keepData) {
  await runCheck(
    report,
    {
      id: "cleanup-temporary-task",
      title: "Delete temporary QA task",
      target: joinUrl(baseUrl, `/tasks/${createdTaskId}`),
      critical: false,
    },
    async () => {
      const { response, body } = await fetchAuthedJson(
        `/tasks/${createdTaskId}`,
        adminAccessToken,
        {
          method: "DELETE",
        },
      );
      if (![200, 404].includes(response.status)) {
        throw new Error(
          `Expected temporary task cleanup success, got ${response.status}${formatBody(body)}`,
        );
      }
      return {
        details: {
          status: response.status,
          taskId: createdTaskId,
          taskName: createdTaskName,
        },
      };
    },
  );
} else if (createdTaskId && keepData) {
  addCheck(report, {
    id: "cleanup-temporary-task",
    title: "Delete temporary QA task",
    target: joinUrl(baseUrl, `/tasks/${createdTaskId}`),
    status: "skip",
    details: {
      reason: "QA_SUBMIT_CONCURRENCY_KEEP_DATA=1 was set.",
      taskId: createdTaskId,
      taskName: createdTaskName,
    },
  });
}

await writeReport(report);
printReportLocation(report);
exitForReport(report);
