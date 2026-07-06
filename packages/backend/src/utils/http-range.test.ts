import assert from 'node:assert/strict';
import { parseSingleByteRange } from './http-range';

function run() {
  assert.deepEqual(parseSingleByteRange(undefined, 100), {
    kind: 'full',
    fileSize: 100,
    contentLength: 100,
  });

  assert.deepEqual(parseSingleByteRange('bytes=0-24', 100), {
    kind: 'partial',
    fileSize: 100,
    range: { start: 0, end: 24 },
    contentLength: 25,
    contentRange: 'bytes 0-24/100',
  });

  assert.deepEqual(parseSingleByteRange('bytes=75-', 100), {
    kind: 'partial',
    fileSize: 100,
    range: { start: 75, end: 99 },
    contentLength: 25,
    contentRange: 'bytes 75-99/100',
  });

  assert.deepEqual(parseSingleByteRange('bytes=-25', 100), {
    kind: 'partial',
    fileSize: 100,
    range: { start: 75, end: 99 },
    contentLength: 25,
    contentRange: 'bytes 75-99/100',
  });

  assert.deepEqual(parseSingleByteRange('bytes=90-200', 100), {
    kind: 'partial',
    fileSize: 100,
    range: { start: 90, end: 99 },
    contentLength: 10,
    contentRange: 'bytes 90-99/100',
  });

  assert.deepEqual(parseSingleByteRange(undefined, 0), {
    kind: 'full',
    fileSize: 0,
    contentLength: 0,
  });

  for (const header of [
    'items=0-1',
    'bytes=',
    'bytes=0-1,3-4',
    'bytes=100-',
    'bytes=10-5',
    'bytes=-0',
    'bytes=abc-def',
  ]) {
    assert.deepEqual(parseSingleByteRange(header, 100), {
      kind: 'not_satisfiable',
      fileSize: 100,
      contentRange: 'bytes */100',
    });
  }

  assert.deepEqual(parseSingleByteRange('bytes=0-0', 0), {
    kind: 'not_satisfiable',
    fileSize: 0,
    contentRange: 'bytes */0',
  });
}

run();
console.log('http-range tests passed');
