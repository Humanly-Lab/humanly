import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

export const REPORT_SCHEMA_VERSION = "humanly.qa.report.v1";

export function arg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return fallback;
}

export function boolArg(name, envName, fallback = false) {
  if (process.argv.includes(`--${name}`)) return true;
  const value = arg(name, process.env[envName]);
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function intArg(name, envName, fallback) {
  const value = arg(name, process.env[envName]);
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function timeoutMsArg(name, envName, fallback) {
  const parsed = intArg(name, envName, fallback);
  return Math.max(1000, parsed);
}

export function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

export function normalizeApiBaseUrl(rawBaseUrl, defaultBaseUrl) {
  const url = new URL(rawBaseUrl || defaultBaseUrl);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/api/v1")) {
    url.pathname = `${url.pathname}/api/v1`.replace(/\/+/g, "/");
  }
  return url.toString().replace(/\/$/, "");
}

export function joinUrl(baseUrl, pathname = "") {
  const cleanBase = String(baseUrl).replace(/\/+$/, "");
  if (!pathname) return cleanBase;
  return `${cleanBase}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function createQaRun({
  layer,
  title,
  outputRoot = "tmp/qa-runs",
  config = {},
}) {
  const runId =
    process.env.QA_RUN_ID ||
    `${layer}-${new Date().toISOString().replace(/[-:.]/g, "")}-${process.pid}`;
  const outputDir = path.resolve(
    arg(
      "output-dir",
      process.env.QA_OUTPUT_DIR || path.join(outputRoot, layer, runId),
    ),
  );

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    run: {
      id: runId,
      layer,
      title,
      startedAt: new Date().toISOString(),
      completedAt: null,
    },
    config,
    checks: [],
    summary: null,
    artifacts: {
      outputDir,
      json: path.join(outputDir, "report.json"),
      markdown: path.join(outputDir, "report.md"),
    },
  };
}

export async function runCheck(
  report,
  { id, title, target, critical = true },
  fn,
) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const check = {
    id,
    title,
    target,
    critical,
    status: "fail",
    startedAt,
    durationMs: 0,
    details: {},
    error: null,
  };

  try {
    const result = await fn();
    check.status = result?.status || "pass";
    check.details = result?.details || {};
    check.error = result?.error || null;
  } catch (error) {
    check.status = "fail";
    check.error = error instanceof Error ? error.message : String(error);
  } finally {
    check.durationMs = Math.round(performance.now() - started);
    report.checks.push(check);
  }

  return check;
}

export function addCheck(
  report,
  {
    id,
    title,
    target,
    status = "skip",
    critical = false,
    details = {},
    error = null,
  },
) {
  const check = {
    id,
    title,
    target,
    critical,
    status,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    details,
    error,
  };
  report.checks.push(check);
  return check;
}

export async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = timeoutMsArg(
    "fetch-timeout-ms",
    "QA_FETCH_TIMEOUT_MS",
    options.timeoutMs || 30000,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
  }
  return { response, body };
}

export function summarize(report) {
  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const check of report.checks) {
    counts[check.status] = (counts[check.status] || 0) + 1;
  }
  const failedCritical = report.checks.filter(
    (check) => check.status === "fail" && check.critical,
  ).length;
  const failedNonCritical = report.checks.filter(
    (check) => check.status === "fail" && !check.critical,
  ).length;
  const status =
    failedCritical > 0
      ? "fail"
      : counts.warn > 0 || failedNonCritical > 0
        ? "warn"
        : "pass";

  return {
    status,
    total: report.checks.length,
    passed: counts.pass || 0,
    failed: counts.fail || 0,
    warned: counts.warn || 0,
    skipped: counts.skip || 0,
    failedCritical,
    failedNonCritical,
  };
}

export function renderMarkdown(report) {
  const summary = report.summary || summarize(report);
  const lines = [
    `# ${report.run.title}`,
    "",
    `Run ID: \`${report.run.id}\``,
    `Layer: \`${report.run.layer}\``,
    `Started: ${report.run.startedAt}`,
    `Completed: ${report.run.completedAt}`,
    `Status: **${summary.status.toUpperCase()}**`,
    "",
    "## Summary",
    "",
    "| Total | Pass | Fail | Warn | Skip | Critical Failures |",
    "| ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${summary.total} | ${summary.passed} | ${summary.failed} | ${summary.warned} | ${summary.skipped} | ${summary.failedCritical} |`,
    "",
    "## Checks",
    "",
    "| Status | Critical | Check | Target | Duration |",
    "| --- | --- | --- | --- | ---: |",
  ];

  for (const check of report.checks) {
    lines.push(
      `| ${check.status} | ${check.critical ? "yes" : "no"} | ${check.title} | ${check.target || ""} | ${check.durationMs}ms |`,
    );
  }

  const detailChecks = report.checks.filter(
    (check) => check.error || Object.keys(check.details || {}).length > 0,
  );
  if (detailChecks.length > 0) {
    lines.push("", "## Details");
    for (const check of detailChecks) {
      lines.push("", `### ${check.id}: ${check.title}`, "");
      if (check.error) {
        lines.push(`Error: \`${check.error}\``, "");
      }
      if (Object.keys(check.details || {}).length > 0) {
        lines.push("```json");
        lines.push(JSON.stringify(check.details, null, 2));
        lines.push("```");
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function writeReport(report) {
  report.run.completedAt = new Date().toISOString();
  report.summary = summarize(report);
  await fs.mkdir(report.artifacts.outputDir, { recursive: true });
  await fs.writeFile(
    report.artifacts.json,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await fs.writeFile(report.artifacts.markdown, renderMarkdown(report));
  return report;
}

export function printReportLocation(report) {
  console.log(`QA report: ${report.artifacts.markdown}`);
  console.log(`QA json: ${report.artifacts.json}`);
}

export function exitForReport(report) {
  if ((report.summary?.failedCritical || 0) > 0) {
    process.exitCode = 1;
  }
}
