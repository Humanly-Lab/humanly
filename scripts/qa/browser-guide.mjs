#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const guide = path.join(root, 'docs/testing/BROWSER_E2E_SKILL.md');
const framework = path.join(root, 'docs/testing/README.md');

console.log('Humanly browser E2E is browser-agent-assisted, not fully unattended.');
console.log('');
console.log(`Guide: ${guide}`);
console.log(`Framework: ${framework}`);
console.log('');
console.log('Recommended flow:');
console.log('1. Create a QA control issue if this is a production/full regression pass.');
console.log('2. Follow the browser guide phase-by-phase.');
console.log('3. Record each phase result in the issue immediately.');
console.log('4. File confirmed bugs with docs/ISSUE_AUTHORING_GUIDE.md.');
