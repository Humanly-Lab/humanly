#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const repo = process.env.QA_REPO || 'ShenzheZhu/humanly';
const appBase = process.env.QA_APP_BASE || 'https://app.writehumanly.net/';
const adminBase = process.env.QA_ADMIN_BASE || 'https://admin.writehumanly.net/';
const titlePrefix = process.env.QA_TITLE_PREFIX || 'QA: full production regression pass';
const dryRun = process.env.QA_DRY_RUN === '1' || process.argv.includes('--dry-run');
const runId =
  process.env.QA_RUN_ID ||
  `full-regression-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`;
const startedAt = new Date().toISOString();

const phases = [
  'Baseline repo/GitHub/deploy health',
  'Fresh registration, login, logout, token/session behavior',
  'User personal document mode: create/edit/PDF/reference/certificate path',
  'Admin task creation/settings/files/model policy',
  'Enroll mode: invite code join, task document, submission session',
  'AI settings/provider smoke: Together + OpenRouter configuration paths',
  'AI chat on task documents: tool-call visibility, grounded output, no markup leaks',
  'Quick actions: grammar/improve/simplify/formal via selected text and silent stream',
  'Submission and certificate generation: verify page, replay, downloads/API',
  'Admin dashboard: task list, overview, submissions, users, user detail, events, analytics, settings',
  'Edge/API negative tests: unauthorized, invalid IDs, invalid invite, provider failure handling',
  'Cross-browser-ish UI smoke: navigation persistence and reloads',
  'Local automated regression suite',
  'Bug fix loop and production retest if any bug is filed',
  'Final report and residual risk register',
];

const body = `# Full Production Regression Control Issue

Run ID: \`${runId}\`
Started: ${startedAt}
Targets:
- User portal: ${appBase}
- Admin portal: ${adminBase}

Rules for this QA pass:
- Use fresh QA accounts where practical.
- Use production-hosted pages and APIs, not local mocks.
- Record each phase result immediately as an issue comment.
- File confirmed product bugs as separate issues and link them here.
- If a confirmed bug is fixable in scope, create branch -> commit -> PR -> CI -> merge/deploy -> retest.
- Do not print API keys or passwords in comments.

## Phase Checklist
${phases.map((phase, index) => `- [ ] Phase ${index}: ${phase}`).join('\n')}

## Linked Bugs / PRs
- Add fixed bugs and residual issues here as the pass runs.

## Local Runtime Artifact
- Store local-only secrets and runtime IDs in \`/tmp/qa-<run-id>.json\`.
- Never paste tokens, API keys, or passwords into this issue.

## Playbook
Follow \`docs/PRODUCTION_QA_PLAYBOOK.md\`.
`;

const args = [
  'issue',
  'create',
  '--repo',
  repo,
  '--title',
  `${titlePrefix} ${runId}`,
  '--body',
  body,
  '--label',
  'qa',
];

if (dryRun) {
  console.log(`# ${titlePrefix} ${runId}`);
  console.log('');
  console.log(body);
  process.exit(0);
}

const result = spawnSync('gh', args, { stdio: 'inherit' });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
