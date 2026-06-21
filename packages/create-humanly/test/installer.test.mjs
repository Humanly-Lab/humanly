import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildSourceUrl,
  generateSecrets,
  installHumanly,
  parseArgs,
  renderQuickstartCompose,
} from '../lib/installer.mjs';

const SAMPLE_COMPOSE = `
services:
  postgres:
    environment:
      POSTGRES_PASSWORD: humanly_password
  backend:
    environment:
      DATABASE_URL: postgresql://humanly_user:humanly_password@postgres:5432/humanly_dev
      JWT_SECRET: humanly_quickstart_local_jwt_secret_change_before_production
      AI_ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000"
      CORS_ORIGIN: http://localhost:3000,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3002
      FRONTEND_ADMIN_URL: http://localhost:3000
      FRONTEND_USER_URL: http://localhost:3002
      PUBLIC_API_URL: http://localhost:3001/api/v1
      EMAIL_SERVICE: console
      QUICKSTART_ADMIN_EMAIL: admin@mail.com
      QUICKSTART_ADMIN_PASSWORD: admin123456
`;

test('parseArgs applies local-only defaults', () => {
  const options = parseArgs(['demo', '--no-start']);

  assert.equal(path.basename(options.dir), 'demo');
  assert.equal(options.noStart, true);
  assert.equal(options.adminEmail, 'admin@mail.com');
  assert.equal(options.adminPassword, 'admin123456');
  assert.equal(options.publisherUrl, 'http://localhost:3000');
  assert.equal(options.writerUrl, 'http://localhost:3002');
  assert.equal(options.apiUrl, 'http://localhost:3001');
});

test('buildSourceUrl defaults to the selected branch ref', () => {
  assert.equal(
    buildSourceUrl('ShenzheZhu/humanly', 'main'),
    'https://codeload.github.com/ShenzheZhu/humanly/tar.gz/refs/heads/main',
  );
});

test('buildSourceUrl treats v-prefixed refs as release tags', () => {
  assert.equal(
    buildSourceUrl('ShenzheZhu/humanly', 'v0.4.0'),
    'https://codeload.github.com/ShenzheZhu/humanly/tar.gz/refs/tags/v0.4.0',
  );
});

test('renderQuickstartCompose replaces fixed local secrets and admin credentials', () => {
  const options = parseArgs([
    'demo',
    '--admin-email',
    'owner@example.com',
    '--admin-password',
    'local-pass',
  ]);
  const secrets = {
    postgresPassword: 'pg-secret',
    jwtSecret: 'jwt-secret',
    aiEncryptionKey: 'a'.repeat(64),
  };

  const output = renderQuickstartCompose(SAMPLE_COMPOSE, options, secrets);

  assert.match(output, /POSTGRES_PASSWORD: pg-secret/);
  assert.match(output, /postgresql:\/\/humanly_user:pg-secret@postgres/);
  assert.match(output, /JWT_SECRET: jwt-secret/);
  assert.match(output, new RegExp(`AI_ENCRYPTION_KEY: "${'a'.repeat(64)}"`));
  assert.match(output, /QUICKSTART_ADMIN_EMAIL: owner@example.com/);
  assert.match(output, /QUICKSTART_ADMIN_PASSWORD: local-pass/);
  assert.doesNotMatch(output, /humanly_password/);
  assert.doesNotMatch(output, /admin123456/);
});

test('generateSecrets creates usable local secret values', () => {
  const secrets = generateSecrets();

  assert.ok(secrets.postgresPassword.length >= 20);
  assert.equal(secrets.jwtSecret.length, 64);
  assert.equal(secrets.aiEncryptionKey.length, 64);
});

test('installHumanly can scaffold from a local source directory without starting Docker', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'create-humanly-test-'));
  const sourceDir = path.join(tempRoot, 'source');
  const targetDir = path.join(tempRoot, 'target');

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'docker-compose.quickstart.yml'), SAMPLE_COMPOSE);
  await fs.writeFile(path.join(sourceDir, 'README.md'), '# source');

  await installHumanly({
    ...parseArgs([targetDir, '--source-dir', sourceDir, '--no-start']),
    noStart: true,
  });

  const compose = await fs.readFile(path.join(targetDir, 'docker-compose.yml'), 'utf8');
  const env = await fs.readFile(path.join(targetDir, '.env.quickstart'), 'utf8');
  const localReadme = await fs.readFile(
    path.join(targetDir, 'HUMANLY_LOCAL_QUICKSTART.md'),
    'utf8',
  );

  assert.match(compose, /EMAIL_SERVICE: console/);
  assert.doesNotMatch(compose, /humanly_quickstart_local_jwt_secret_change_before_production/);
  assert.match(env, /EMAIL_SERVICE=console/);
  assert.match(localReadme, /no third-party email/i);
});
