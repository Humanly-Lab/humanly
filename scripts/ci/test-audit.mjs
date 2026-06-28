import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ignoredSegments = new Set(['node_modules', 'dist', '.next']);
const testFilePattern = /\.(?:test|spec)\.(?:cjs|js|mjs|ts|tsx)$/;

const runnableTestFiles = new Set([
  'packages/backend/src/controllers/ai.controller.test.ts',
  'packages/backend/src/services/task-public-share-link.service.test.ts',
  'packages/create-humanly/test/installer.test.mjs',
  'packages/frontend-user/src/components/pdf/PDFViewer.resource-options.test.js',
]);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredSegments.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, files);
      continue;
    }

    if (entry.isFile() && testFilePattern.test(entry.name)) {
      files.push(path.relative(repoRoot, absolutePath).split(path.sep).join('/'));
    }
  }

  return files;
}

const testFiles = walk(path.join(repoRoot, 'packages')).sort();
const runnable = [];
const auditedOnly = [];

for (const file of testFiles) {
  if (runnableTestFiles.has(file)) {
    runnable.push(file);
  } else {
    auditedOnly.push(file);
  }
}

console.log('Runnable test files included in pnpm test:runnable:');
for (const file of runnable) {
  console.log(`- ${file}`);
}

if (auditedOnly.length > 0) {
  console.log('\nDiscovered test files not run in phase 1:');
  for (const file of auditedOnly) {
    console.log(`- ${file}`);
  }
  console.log('\nThese files require an explicit Jest/Vitest + Testing Library runner before they can become blocking CI tests.');
}

const unknownRunnable = [...runnableTestFiles].filter((file) => !testFiles.includes(file));
if (unknownRunnable.length > 0) {
  console.error('\nTest audit failed. Runnable test entries no longer exist:');
  for (const file of unknownRunnable) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(`\nTest audit complete: ${runnable.length} runnable, ${auditedOnly.length} audited-only.`);
