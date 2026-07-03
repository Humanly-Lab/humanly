import assert from 'node:assert/strict';
import {
  CertificateSealInput,
  CertificateSealService,
} from './certificate-seal.service';

const baseInput: CertificateSealInput = {
  id: '11111111-1111-4111-8111-111111111111',
  submissionId: null,
  documentId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
  certificateType: 'full_authorship',
  title: 'Detector seal test',
  documentSnapshot: { root: { children: [] } },
  plainTextSnapshot: 'hello',
  totalEvents: 3,
  typingEvents: 2,
  pasteEvents: 1,
  totalCharacters: 5,
  typedCharacters: 5,
  pastedCharacters: 0,
  editingTimeSeconds: 12,
  anomalyFlags: [],
  verificationToken: 'token',
  signerName: null,
  includeFullText: true,
  includeEditHistory: true,
  isProtected: false,
  generatedAt: '2026-07-03T12:00:00.000Z',
};

const detectorResults: NonNullable<CertificateSealInput['detectorResults']> = {
  anomalyPattern: {
    enabled: true,
    status: 'pass',
    flags: [],
    generatedAt: '2026-07-03T12:00:00.000Z',
  },
  humanTyping: {
    enabled: true,
    status: 'unknown',
    result: {
      ok: true,
      label: 'unknown',
      reason: 'no_events',
      n_events: 0,
    },
    spec: null,
    error: null,
    generatedAt: '2026-07-03T12:00:00.000Z',
  },
};

function run() {
  const secret = 'test-secret';

  const legacyShapeSeal = CertificateSealService.createSeal(baseInput, secret);
  assert.equal(
    CertificateSealService.verifySeal(baseInput, secret, legacyShapeSeal.signature).valid,
    true
  );
  assert.equal(legacyShapeSeal.signedFields.includes('detectorResults'), false);

  const detectorInput = {
    ...baseInput,
    detectorResults,
  };
  const detectorSeal = CertificateSealService.createSeal(detectorInput, secret);
  assert.equal(
    CertificateSealService.verifySeal(detectorInput, secret, detectorSeal.signature).valid,
    true
  );
  assert.equal(detectorSeal.signedFields.includes('detectorResults'), true);

  const tamperedInput: CertificateSealInput = {
    ...detectorInput,
    detectorResults: {
      ...detectorResults,
      humanTyping: {
        ...detectorResults.humanTyping,
        status: 'agent',
      },
    },
  };
  assert.equal(
    CertificateSealService.verifySeal(tamperedInput, secret, detectorSeal.signature).valid,
    false
  );
}

run();
console.log('certificate-detector-seal tests passed');
