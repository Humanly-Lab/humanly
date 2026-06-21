import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DEFAULT_REPO = 'ShenzheZhu/humanly';
const DEFAULT_SOURCE_REF = 'main';
const DEFAULT_TARGET_DIR = 'humanly';
const DEFAULT_ADMIN_EMAIL = 'admin@mail.com';
const DEFAULT_ADMIN_PASSWORD = 'admin123456';
const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

const SKIPPED_COPY_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'node_modules',
  'dist',
  'coverage',
]);

export function parseArgs(argv) {
  let hasDirectoryArg = false;
  const options = {
    dir: DEFAULT_TARGET_DIR,
    sourceRef: process.env.HUMANLY_SOURCE_REF || DEFAULT_SOURCE_REF,
    repo: process.env.HUMANLY_REPO || DEFAULT_REPO,
    sourceUrl: process.env.HUMANLY_SOURCE_URL || '',
    sourceDir: '',
    noStart: false,
    force: false,
    adminEmail: DEFAULT_ADMIN_EMAIL,
    adminPassword: DEFAULT_ADMIN_PASSWORD,
    publisherUrl: 'http://localhost:3000',
    writerUrl: 'http://localhost:3002',
    apiUrl: 'http://localhost:3001',
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--no-start') {
      options.noStart = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--source-ref') {
      options.sourceRef = requireValue(argv, ++i, arg);
    } else if (arg === '--repo') {
      options.repo = requireValue(argv, ++i, arg);
    } else if (arg === '--source-url') {
      options.sourceUrl = requireValue(argv, ++i, arg);
    } else if (arg === '--source-dir') {
      options.sourceDir = requireValue(argv, ++i, arg);
    } else if (arg === '--admin-email') {
      options.adminEmail = requireValue(argv, ++i, arg);
    } else if (arg === '--admin-password') {
      options.adminPassword = requireValue(argv, ++i, arg);
    } else if (arg === '--publisher-url') {
      options.publisherUrl = trimTrailingSlash(requireValue(argv, ++i, arg));
    } else if (arg === '--writer-url') {
      options.writerUrl = trimTrailingSlash(requireValue(argv, ++i, arg));
    } else if (arg === '--api-url') {
      options.apiUrl = trimTrailingSlash(requireValue(argv, ++i, arg));
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!hasDirectoryArg) {
      options.dir = arg;
      hasDirectoryArg = true;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  options.dir = path.resolve(options.dir);
  options.sourceDir = options.sourceDir
    ? path.resolve(options.sourceDir)
    : '';
  options.sourceUrl = options.sourceUrl || buildSourceUrl(options.repo, options.sourceRef);

  return options;
}

export async function main(argv) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(helpText());
    return;
  }

  if (options.version) {
    console.log(await packageVersion());
    return;
  }

  await installHumanly(options);
}

export async function installHumanly(options) {
  const secrets = generateSecrets();

  await assertTargetWritable(options.dir, options.force);
  await fs.mkdir(options.dir, { recursive: true });

  if (options.sourceDir) {
    console.log(`Copying Humanly source from ${options.sourceDir}`);
    await copySourceDir(options.sourceDir, options.dir);
  } else {
    console.log(`Downloading Humanly source from ${options.sourceUrl}`);
    await downloadAndExtractSource(options.sourceUrl, options.dir);
  }

  const quickstartPath = path.join(options.dir, 'docker-compose.quickstart.yml');
  const composeInput = await fs.readFile(quickstartPath, 'utf8');
  const compose = renderQuickstartCompose(composeInput, options, secrets);
  await fs.writeFile(path.join(options.dir, 'docker-compose.yml'), compose);
  await fs.writeFile(path.join(options.dir, '.env.quickstart'), renderQuickstartEnv(options, secrets));
  await fs.writeFile(path.join(options.dir, 'HUMANLY_LOCAL_QUICKSTART.md'), renderLocalReadme(options));

  if (options.noStart) {
    printDone(options, false);
    return;
  }

  console.log('Starting Humanly with Docker Compose. Initial build can take several minutes.');
  await run('docker', ['compose', '-f', 'docker-compose.yml', 'up', '--build', '-d'], {
    cwd: options.dir,
  });
  printDone(options, true);
}

export function generateSecrets() {
  return {
    postgresPassword: crypto.randomBytes(18).toString('base64url'),
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    aiEncryptionKey: crypto.randomBytes(32).toString('hex'),
  };
}

export function renderQuickstartCompose(composeInput, options, secrets) {
  const corsOrigin = [
    options.publisherUrl,
    options.writerUrl,
    options.publisherUrl.replace('localhost', '127.0.0.1'),
    options.writerUrl.replace('localhost', '127.0.0.1'),
  ]
    .filter(unique)
    .join(',');

  const publicApiUrl = `${options.apiUrl}/api/v1`;

  return composeInput
    .replaceAll('humanly_password', escapeComposeValue(secrets.postgresPassword))
    .replaceAll(
      'humanly_quickstart_local_jwt_secret_change_before_production',
      escapeComposeValue(secrets.jwtSecret),
    )
    .replaceAll(
      '0000000000000000000000000000000000000000000000000000000000000000',
      secrets.aiEncryptionKey,
    )
    .replaceAll('http://localhost:3000,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3002', corsOrigin)
    .replaceAll('http://localhost:3000', options.publisherUrl)
    .replaceAll('http://localhost:3002', options.writerUrl)
    .replaceAll('http://localhost:3001/api/v1', publicApiUrl)
    .replaceAll('http://localhost:3001', options.apiUrl)
    .replaceAll('admin@mail.com', options.adminEmail)
    .replaceAll('admin123456', options.adminPassword);
}

export function renderQuickstartEnv(options, secrets) {
  return [
    '# Generated by create-humanly. Keep this file local.',
    'HUMANLY_INSTALL_MODE=quickstart',
    `HUMANLY_SOURCE_REF=${options.sourceRef}`,
    `HUMANLY_REPO=${options.repo}`,
    `PUBLISHER_PORTAL_URL=${options.publisherUrl}`,
    `WRITER_PORTAL_URL=${options.writerUrl}`,
    `BACKEND_API_URL=${options.apiUrl}`,
    `QUICKSTART_ADMIN_EMAIL=${options.adminEmail}`,
    `QUICKSTART_ADMIN_PASSWORD=${options.adminPassword}`,
    `POSTGRES_PASSWORD=${secrets.postgresPassword}`,
    `JWT_SECRET=${secrets.jwtSecret}`,
    `AI_ENCRYPTION_KEY=${secrets.aiEncryptionKey}`,
    'EMAIL_SERVICE=console',
    'FILE_STORAGE_PROVIDER=local',
    '',
  ].join('\n');
}

export function renderLocalReadme(options) {
  return `# Humanly Local Quickstart

This directory was generated by \`create-humanly\`.

## Start

\`\`\`bash
docker compose -f docker-compose.yml up --build -d
\`\`\`

## Open

- Publisher Portal: ${options.publisherUrl}
- Writer Portal: ${options.writerUrl}
- Backend API: ${options.apiUrl}

## Default local admin

- Email: \`${options.adminEmail}\`
- Password: \`${options.adminPassword}\`

## Stop

\`\`\`bash
docker compose -f docker-compose.yml down
\`\`\`

## Reset local data

\`\`\`bash
docker compose -f docker-compose.yml down -v
\`\`\`

Email is local-only in this quickstart. Humanly prints account and notification
emails to backend logs with \`EMAIL_SERVICE=console\`; no third-party email
provider is required.
`;
}

export function helpText() {
  return `create-humanly

Create and optionally start a local Humanly self-host installation.

Usage:
  npx create-humanly@latest [directory] [options]

Options:
  --no-start                 Generate files without starting Docker Compose
  --force                    Allow writing into an existing directory
  --source-ref <ref>         GitHub branch or tag to download (default: main)
  --source-url <url>         Full tar.gz source URL
  --source-dir <path>        Copy source from a local directory instead of downloading
  --repo <owner/repo>        GitHub repository to download (default: ShenzheZhu/humanly)
  --admin-email <email>      Default local Publisher Portal admin email
  --admin-password <pass>    Default local Publisher Portal admin password
  --publisher-url <url>      Local Publisher Portal URL (default: http://localhost:3000)
  --writer-url <url>         Local Writer Portal URL (default: http://localhost:3002)
  --api-url <url>            Local backend URL (default: http://localhost:3001)
  --help                     Show help
  --version                  Show package version

Local quickstart defaults use console email and local uploads, so no SendGrid,
SMTP, S3, or other third-party services are required.
`;
}

export function buildSourceUrl(repo, sourceRef) {
  const refPath = sourceRef.startsWith('refs/')
    ? sourceRef
    : sourceRef.startsWith('v')
      ? `refs/tags/${sourceRef}`
      : `refs/heads/${sourceRef}`;
  const encodedRefPath = refPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `https://codeload.github.com/${repo}/tar.gz/${encodedRefPath}`;
}

async function assertTargetWritable(targetDir, force) {
  try {
    const entries = await fs.readdir(targetDir);
    if (entries.length > 0 && !force) {
      throw new Error(
        `Target directory is not empty: ${targetDir}. Use --force or choose a new directory.`,
      );
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function downloadAndExtractSource(sourceUrl, targetDir) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-humanly-'));
  const archivePath = path.join(tempDir, 'humanly.tar.gz');

  try {
    const response = await fetch(sourceUrl, { redirect: 'follow' });
    if (!response.ok || !response.body) {
      throw new Error(`Could not download source archive: HTTP ${response.status}`);
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(archivePath));
    await run('tar', ['-xzf', archivePath, '--strip-components=1', '-C', targetDir]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function copySourceDir(sourceDir, targetDir) {
  await fs.cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (source) => {
      const basename = path.basename(source);
      return !SKIPPED_COPY_DIRS.has(basename);
    },
  });
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function packageVersion() {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
  );
  return packageJson.version;
}

function printDone(options, started) {
  const startText = started
    ? 'Humanly is starting. Use docker compose logs -f to watch startup.'
    : 'Humanly files are ready. Start later with docker compose -f docker-compose.yml up --build -d.';

  console.log(`
${startText}

Directory:        ${options.dir}
Publisher Portal: ${options.publisherUrl}
Writer Portal:    ${options.writerUrl}
Backend API:      ${options.apiUrl}

Default local admin:
  email:    ${options.adminEmail}
  password: ${options.adminPassword}

Local email is handled with EMAIL_SERVICE=console. No third-party email service is required.
`);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function unique(value, index, array) {
  return value && array.indexOf(value) === index;
}

function escapeComposeValue(value) {
  return value.replace(/[$]/g, '$$$$');
}
