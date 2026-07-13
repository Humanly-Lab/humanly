import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);
const pathsFileIndex = args.indexOf('--paths-file');

if (pathsFileIndex >= 0 && !args[pathsFileIndex + 1]) {
  console.error('Usage: community-boundary.mjs [--paths-file FILE]');
  process.exit(2);
}

const trackedPaths = pathsFileIndex >= 0
  ? fs.readFileSync(args[pathsFileIndex + 1], 'utf8').split(/\r?\n/).filter(Boolean)
  : execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter((filePath) => filePath && fs.existsSync(path.join(repoRoot, filePath)));

const forbiddenExactPaths = new Set([
  'docker-compose.prod.yml',
  'docker-compose.production.yml',
  'scripts/deploy.sh',
  'scripts/ensure-production-cert.sh',
  'scripts/repair-production-ssh-access.sh',
  'config/gcs-cors.production.json',
]);
const forbiddenPrefixes = ['nginx/'];
const managedWorkflowPattern = /^\.github\/workflows\/.*deploy.*\.ya?ml$/;
const managedHostnamePattern = /(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\.)*writehumanly\.net(?=$|[^a-z0-9.-])/im;

const pathViolations = trackedPaths.filter((filePath) =>
  forbiddenExactPaths.has(filePath)
  || forbiddenPrefixes.some((prefix) => filePath.startsWith(prefix))
  || managedWorkflowPattern.test(filePath));

const staleReferenceChecks = new Map([
  ['.env.example', [
    'docker-compose.prod.yml',
    'docker-compose.production.yml',
  ]],
  ['packages/backend/package.json', [
    'docker-compose.prod.yml',
    'docker-compose.production.yml',
  ]],
  ['docs/SELF_DEPLOY.md', [
    'config/gcs-cors.production.json',
    '/opt/humanly/secrets/gcs-pdf-signer.json',
  ]],
]);
const referenceViolations = [];

if (pathsFileIndex < 0) {
  for (const [filePath, forbiddenValues] of staleReferenceChecks) {
    const absolutePath = path.join(repoRoot, filePath);
    const contents = fs.readFileSync(absolutePath, 'utf8');
    for (const forbiddenValue of forbiddenValues) {
      if (contents.includes(forbiddenValue)) {
        referenceViolations.push(`${filePath}: ${forbiddenValue}`);
      }
    }
  }

  const workflowPaths = trackedPaths.filter((filePath) => filePath.startsWith('.github/workflows/'));
  for (const filePath of workflowPaths) {
    const contents = fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
    if (managedHostnamePattern.test(contents)) {
      referenceViolations.push(`${filePath}: official managed-service hostname`);
    }
  }
}

if (pathViolations.length > 0 || referenceViolations.length > 0) {
  console.error('Community boundary audit failed. Managed Cloud deployment belongs in humanly-cloud.');
  for (const violation of pathViolations) {
    console.error(`- forbidden path: ${violation}`);
  }
  for (const violation of referenceViolations) {
    console.error(`- forbidden reference: ${violation}`);
  }
  process.exit(1);
}

console.log(`Community boundary audit passed for ${trackedPaths.length} tracked paths.`);
