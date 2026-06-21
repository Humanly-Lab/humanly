import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const requiredFiles = [
  'bin/create-humanly.mjs',
  'lib/installer.mjs',
  'README.md',
  'package.json',
];

await Promise.all(
  requiredFiles.map((file) =>
    access(path.join(packageRoot, file), constants.R_OK),
  ),
);

console.log('create-humanly package files are present.');
