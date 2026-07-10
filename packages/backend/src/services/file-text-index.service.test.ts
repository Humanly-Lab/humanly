import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { closeDatabaseConnection } from '../config/database';
import {
  buildFileTextIndexPublicationPlan,
  shouldStartFileTextIndexAttempt,
  truncateTextIndexError,
} from './file-text-index.service';

function run() {
  const readyPlan = buildFileTextIndexPublicationPlan([
    { pageNumber: 2, text: '' },
    { pageNumber: 1, text: 'Introduction\nThis page has searchable text.' },
  ]);
  assert.equal(readyPlan.status, 'ready');
  assert.equal(readyPlan.pageCount, 2);
  assert.equal(readyPlan.textPageCount, 1);
  assert.deepEqual(readyPlan.pages.map(page => page.pageNumber), [1, 2]);
  assert.equal(readyPlan.chunks.length, 1);
  assert.equal(readyPlan.chunks[0].pageNumber, 1);
  assert.equal(readyPlan.sections[0].sectionTitle, 'Introduction');

  const unavailablePlan = buildFileTextIndexPublicationPlan([
    { pageNumber: 1, text: '   ' },
    { pageNumber: 2, text: '' },
  ]);
  assert.equal(unavailablePlan.status, 'unavailable');
  assert.equal(unavailablePlan.pageCount, 2);
  assert.equal(unavailablePlan.textPageCount, 0);
  assert.equal(unavailablePlan.chunks.length, 0);

  const now = Date.UTC(2026, 6, 7, 12, 0, 0);
  assert.equal(shouldStartFileTextIndexAttempt({
    status: 'ready',
    indexVersion: 1,
    attempts: 1,
  }, { now }), false);
  assert.equal(shouldStartFileTextIndexAttempt({
    status: 'unavailable',
    indexVersion: 1,
    attempts: 1,
  }, { now }), false);
  assert.equal(shouldStartFileTextIndexAttempt({
    status: 'processing',
    indexVersion: 1,
    attempts: 1,
    startedAt: new Date(now - 60_000),
  }, { now }), false);
  assert.equal(shouldStartFileTextIndexAttempt({
    status: 'processing',
    indexVersion: 1,
    attempts: 1,
    startedAt: new Date(now - 11 * 60_000),
  }, { now }), true);
  assert.equal(shouldStartFileTextIndexAttempt({
    status: 'failed',
    indexVersion: 1,
    attempts: 3,
  }, { now }), false);
  assert.equal(shouldStartFileTextIndexAttempt({
    status: 'failed',
    indexVersion: 1,
    attempts: 3,
  }, { force: true, now }), true);
  assert.equal(shouldStartFileTextIndexAttempt({
    status: 'pending',
    indexVersion: 1,
    attempts: 0,
  }, { now }), true);
  assert.equal(shouldStartFileTextIndexAttempt({
    status: 'ready',
    indexVersion: 0,
    attempts: 1,
  }, { now }), true);

  const longError = new Error('x'.repeat(2000));
  assert.equal(truncateTextIndexError(longError).length, 1003);
  assert.match(truncateTextIndexError(longError), /\.\.\.$/);

  const serviceSource = fs.readFileSync(path.join(__dirname, 'file-text-index.service.ts'), 'utf8');
  assert.match(serviceSource, /FOR UPDATE/);
  assert.match(serviceSource, /current\.rows\[0\]\.generationId !== generationId/);
  assert.match(serviceSource, /DELETE FROM file_pages[\s\S]*DELETE FROM file_sections[\s\S]*DELETE FROM file_text_chunks/);
  assert.match(serviceSource, /status = 'failed'/);
  assert.match(serviceSource, /File text indexing completed/);
  assert.match(serviceSource, /durationMs: Date\.now\(\) - indexingStartedAt/);

  const migrationSource = fs.readFileSync(
    path.join(__dirname, '../db/migrations/053_file_text_indexes.sql'),
    'utf8'
  );
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS file_text_indexes/);
  assert.match(migrationSource, /status IN \('pending', 'processing', 'ready', 'failed', 'unavailable'\)/);
  assert.match(migrationSource, /Production-safe backfill/);
  assert.match(migrationSource, /ON CONFLICT \(file_id\) DO NOTHING/);
}

run();
void closeDatabaseConnection().then(() => {
  console.log('file-text-index.service tests passed');
});
