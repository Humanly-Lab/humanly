#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addCheck,
  arg,
  createQaRun,
  printReportLocation,
  runCheck,
  writeReport,
} from "./lib/qa-report.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const skill = path.join(root, ".agents/skills/humanly-browser-e2e/SKILL.md");
const guide = path.join(root, "docs/testing/BROWSER_E2E_PLAYBOOK.md");
const framework = path.join(root, "docs/testing/README.md");
const modelMatrixReference = path.join(
  root,
  ".agents/skills/humanly-browser-e2e/references/ai-model-matrix.md",
);

const PHASES = [
  {
    id: "A",
    title: "User Auth",
    goal: "Fresh user registration, logout/login, wrong-password handling, and refresh stability.",
  },
  {
    id: "B",
    title: "Personal Document Mode",
    goal: "Self-created document editing, persistence, PDF upload, and personal-mode boundaries.",
  },
  {
    id: "C",
    title: "AI Chat",
    goal: "Agentic chat, tool UI, reasoning/final separation, negative lookups, model switching, and image gating.",
  },
  {
    id: "C2",
    title: "Focused AI Model Matrix",
    goal: "Curated model selection, image+text/text-only labels, image gating, grounded PDF QA, tool UI, no raw markup, and follow-up stability.",
  },
  {
    id: "D",
    title: "Quick Actions",
    goal: "Selection-only grammar/improve/simplify/formal actions, apply/cancel, and no retrieval fallback text.",
  },
  {
    id: "E",
    title: "Enroll Mode",
    goal: "Invite-code enrollment, task-scoped document creation, task files, AI policy, and submission state.",
  },
  {
    id: "F",
    title: "Admin Dashboard",
    goal: "Admin task settings, submission inspection, dashboard counts, charts, certificate/replay links.",
  },
  {
    id: "G",
    title: "Certificate And Public Verify",
    goal: "Certificate generation, public verify, downloads, stats, and replay/history access.",
  },
  {
    id: "H",
    title: "Browser Resilience Edges",
    goal: "Hard refresh, navigation, cancellation, invalid upload, token expiry, and stale-state cleanup.",
  },
];

function showHelp() {
  console.log(`Humanly browser E2E guide packet

Usage:
  pnpm qa:browser:guide

Environment / flags:
  QA_BROWSER_PHASES / --phases=A,C,D    Comma-separated phase ids to include
  QA_BROWSER_TARGET / --target          Target surface label, e.g. production or localhost
  QA_BROWSER_ISSUE / --issue            QA control issue URL or id
  QA_OUTPUT_DIR / --output-dir          Report output directory

This command does not pretend browser QA is unattended. It creates a reusable
report packet and phase checklist for Codex browser-agent or human execution.
`);
}

function parsePhaseFilter(value) {
  const ids = String(value || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  if (ids.length === 0) return null;
  return new Set(ids);
}

function renderPhasePacket(report, phases, target, issue) {
  const lines = [
    "# Humanly Browser E2E Phase Packet",
    "",
    `Run ID: \`${report.run.id}\``,
    `Target: ${target || "unspecified"}`,
    `QA Control Issue: ${issue || "unspecified"}`,
    `Skill: \`${skill}\``,
    `Guide: \`${guide}\``,
    `Framework: \`${framework}\``,
    `Model Matrix Reference: \`${modelMatrixReference}\``,
    "",
    "Use one issue comment per phase. Replace placeholders as you execute.",
  ];

  for (const phase of phases) {
    lines.push(
      "",
      `## Phase ${phase.id}: ${phase.title}`,
      "",
      "Status: pending",
      "Started:",
      "Finished:",
      "",
      "Context:",
      "- Surface: app / admin / localhost / production",
      "- URL(s):",
      "- Role/account:",
      "- Mode: personal document / enroll task / admin task",
      "- Provider/model, if AI-related:",
      "- Fixture(s):",
      "",
      "Steps Run:",
      "1.",
      "2.",
      "3.",
      "",
      `Expected: ${phase.goal}`,
      "",
      "Actual:",
      "",
      "Evidence:",
      "- Screenshot(s):",
      "- Console errors:",
      "- Network errors:",
      "- Report artifact:",
      "",
      "Bug Links:",
      "- None / #...",
      "",
      "Regression Check:",
      "- Ledger match:",
      "- Classification if bug filed:",
      "- Regression lock needed:",
      "",
      "Residual Risk:",
      "- None / ...",
    );
  }

  return `${lines.join("\n")}\n`;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
  process.exit(0);
}

const phaseFilter = parsePhaseFilter(
  arg("phases", process.env.QA_BROWSER_PHASES),
);
const target = arg("target", process.env.QA_BROWSER_TARGET || "");
const issue = arg("issue", process.env.QA_BROWSER_ISSUE || "");
const selectedPhases = phaseFilter
  ? PHASES.filter((phase) => phaseFilter.has(phase.id))
  : PHASES;

const report = createQaRun({
  layer: "browser-guide",
  title: "Browser E2E Guide Packet",
  config: {
    target: target || undefined,
    issue: issue || undefined,
    phases: selectedPhases.map((phase) => phase.id),
  },
});
report.artifacts.phasePacket = path.join(
  report.artifacts.outputDir,
  "phase-packet.md",
);

await runCheck(
  report,
  {
    id: "phase-packet-generate",
    title: "Browser E2E phase packet is generated",
    target: report.artifacts.phasePacket,
  },
  async () => {
    await fs.mkdir(report.artifacts.outputDir, { recursive: true });
    await fs.writeFile(
      report.artifacts.phasePacket,
      renderPhasePacket(report, selectedPhases, target, issue),
    );
    return {
      details: {
        phaseCount: selectedPhases.length,
        skill,
        guide,
        framework,
        modelMatrixReference,
      },
    };
  },
);

for (const phase of selectedPhases) {
  addCheck(report, {
    id: `phase-${phase.id.toLowerCase()}`,
    title: `Phase ${phase.id}: ${phase.title}`,
    target: target || "browser-agent-assisted",
    status: "skip",
    details: {
      reason:
        "Browser-agent-assisted phase; execute manually with the Humanly Browser E2E repo skill and playbook.",
      goal: phase.goal,
    },
  });
}

if (selectedPhases.length === 0) {
  addCheck(report, {
    id: "phase-selection",
    title: "Selected browser phases",
    target: target || "browser-agent-assisted",
    status: "warn",
    details: {
      reason: "No phases matched QA_BROWSER_PHASES/--phases.",
    },
  });
}

await writeReport(report);

console.log(
  "Humanly browser E2E is browser-agent-assisted, not fully unattended.",
);
console.log("");
console.log(`Skill: ${skill}`);
console.log(`Guide: ${guide}`);
console.log(`Framework: ${framework}`);
console.log(`Model matrix reference: ${modelMatrixReference}`);
console.log(`Phase packet: ${report.artifacts.phasePacket}`);
console.log("");
console.log("Recommended flow:");
console.log(
  "1. Create a QA control issue if this is a production/full regression pass.",
);
console.log("2. Use the repo skill and follow the browser guide phase-by-phase.");
console.log("3. Record each phase result in the issue immediately.");
console.log("4. File confirmed bugs with docs/ISSUE_AUTHORING_GUIDE.md.");
printReportLocation(report);
