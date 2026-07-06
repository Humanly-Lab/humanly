import assert from 'node:assert/strict';
import {
  authenticatedApiAllowedHeaders,
  authenticatedApiExposedHeaders,
} from './cors';

function assertIncludesAll(
  actual: readonly string[],
  expected: readonly string[]
) {
  for (const header of expected) {
    assert.ok(actual.includes(header), `Expected ${header} to be configured`);
  }
}

function run() {
  assertIncludesAll(authenticatedApiAllowedHeaders, [
    'Authorization',
    'Range',
    'X-File-View-Token',
  ]);

  assertIncludesAll(authenticatedApiExposedHeaders, [
    'Accept-Ranges',
    'Content-Length',
    'Content-Range',
    'Content-Disposition',
  ]);
}

run();
console.log('cors config tests passed');
