import {
  CertificateSealInput,
  CertificateSealService,
  canonicalJSONString,
  sha256Hex,
} from '../../services/certificate-seal.service';
import crypto from 'crypto';

const SECRET = 'test-certificate-seal-secret';

function makeSealInput(overrides: Partial<CertificateSealInput> = {}): CertificateSealInput {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    submissionId: null,
    documentId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    certificateType: 'full_authorship',
    title: 'Certificate Test',
    documentSnapshot: {
      root: {
        children: [
          {
            children: [{ text: 'Humanly certificate text' }],
            type: 'paragraph',
          },
        ],
      },
    },
    plainTextSnapshot: 'Humanly certificate text',
    totalEvents: 12,
    typingEvents: 10,
    pasteEvents: 2,
    totalCharacters: 25,
    typedCharacters: 20,
    pastedCharacters: 5,
    editingTimeSeconds: 120,
    anomalyFlags: [],
    verificationToken: 'verification-token',
    signerName: 'Test Writer',
    includeFullText: true,
    includeEditHistory: true,
    isProtected: false,
    generatedAt: '2026-06-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('CertificateSealService', () => {
  it('canonicalizes object keys deterministically', () => {
    expect(canonicalJSONString({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalJSONString({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it('creates a versioned seal that verifies against the same certificate payload', () => {
    const input = makeSealInput();
    const seal = CertificateSealService.createSeal(input, SECRET);

    expect(seal.version).toBe('hly-seal-v2');
    expect(seal.algorithm).toBe('HMAC-SHA256');
    expect(seal.signature).toMatch(/^hly-seal-v2\./);

    const verification = CertificateSealService.verifySeal(input, SECRET, seal.signature);

    expect(verification.valid).toBe(true);
    expect(verification.sealStatus).toBe('valid');
    expect(verification.seal?.payloadHash).toBe(seal.payloadHash);
  });

  it('fails verification when protected metrics are changed', () => {
    const input = makeSealInput();
    const seal = CertificateSealService.createSeal(input, SECRET);
    const tampered = makeSealInput({ typedCharacters: 21 });

    const verification = CertificateSealService.verifySeal(tampered, SECRET, seal.signature);

    expect(verification.valid).toBe(false);
    expect(verification.sealStatus).toBe('invalid');
  });

  it('fails verification when protected text content is changed', () => {
    const input = makeSealInput();
    const seal = CertificateSealService.createSeal(input, SECRET);
    const tampered = makeSealInput({ plainTextSnapshot: 'Changed certificate text' });

    const verification = CertificateSealService.verifySeal(tampered, SECRET, seal.signature);

    expect(verification.valid).toBe(false);
    expect(verification.sealStatus).toBe('invalid');
  });

  it('fails verification when protected anomaly flags are changed', () => {
    const input = makeSealInput({
      anomalyFlags: [
        {
          code: 'uniform_key_cadence',
          severity: 'warning',
          label: 'Uniform key cadence',
          description: 'Key intervals were unusually uniform.',
          evidence: { intervalCount: 42 },
        },
      ],
    });
    const seal = CertificateSealService.createSeal(input, SECRET);
    const tampered = makeSealInput({ anomalyFlags: [] });

    const verification = CertificateSealService.verifySeal(tampered, SECRET, seal.signature);

    expect(verification.valid).toBe(false);
    expect(verification.sealStatus).toBe('invalid');
  });

  it('continues to verify legacy v1 seals that do not protect anomaly flags', () => {
    const input = makeSealInput({
      anomalyFlags: [
        {
          code: 'uniform_key_cadence',
          severity: 'warning',
          label: 'Uniform key cadence',
          description: 'Key intervals were unusually uniform.',
          evidence: { intervalCount: 42 },
        },
      ],
    });

    const legacyPayload = {
      version: 'hly-seal-v1',
      certificateId: input.id,
      submissionId: input.submissionId || null,
      documentId: input.documentId,
      userId: input.userId,
      certificateType: input.certificateType,
      title: input.title,
      verificationToken: input.verificationToken,
      generatedAt: new Date(input.generatedAt).toISOString(),
      content: {
        documentSnapshotSha256: sha256Hex(canonicalJSONString(input.documentSnapshot || {})),
        plainTextSnapshotSha256: sha256Hex(input.plainTextSnapshot || ''),
      },
      metrics: {
        totalEvents: input.totalEvents,
        typingEvents: input.typingEvents,
        pasteEvents: input.pasteEvents,
        totalCharacters: input.totalCharacters,
        typedCharacters: input.typedCharacters,
        pastedCharacters: input.pastedCharacters,
        editingTimeSeconds: input.editingTimeSeconds,
      },
      options: {
        signerName: input.signerName || null,
        includeFullText: input.includeFullText,
        includeEditHistory: input.includeEditHistory,
        isProtected: input.isProtected,
      },
    };

    const legacyPayloadHash = sha256Hex(canonicalJSONString(legacyPayload));
    const legacySignatureBody = crypto
      .createHmac('sha256', SECRET)
      .update(`hly-seal-v1.${legacyPayloadHash}`, 'utf8')
      .digest('base64url');
    const verification = CertificateSealService.verifySeal(
      input,
      SECRET,
      `hly-seal-v1.${legacySignatureBody}`
    );

    expect(verification.valid).toBe(true);
    expect(verification.sealStatus).toBe('legacy_valid');
    expect(verification.seal?.version).toBe('hly-seal-v1');
    expect(verification.seal?.signedFields).not.toContain('anomalyFlags');
  });
});
