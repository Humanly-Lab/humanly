jest.mock('../../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import { queryOne } from '../../config/database';
import { CertificateModel } from '../../models/certificate.model';

const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;

describe('CertificateModel', () => {
  beforeEach(() => {
    mockQueryOne.mockReset();
  });

  it('persists generatedAt as timestamptz so certificate seals stay timezone stable', async () => {
    const generatedAt = new Date('2026-06-12T14:05:05.583Z');
    const certificate = {
      id: 'certificate-1',
      submissionId: 'submission-1',
      documentId: 'document-1',
      userId: 'user-1',
      certificateType: 'full_authorship' as const,
      status: 'active' as const,
      title: 'QA Study Submission',
      documentSnapshot: { root: { children: [] } },
      plainTextSnapshot: 'QA text',
      totalEvents: 3,
      typingEvents: 1,
      pasteEvents: 0,
      totalCharacters: 7,
      typedCharacters: 7,
      pastedCharacters: 0,
      editingTimeSeconds: 2,
      anomalyFlags: [],
      policyHash: 'policy-hash',
      signature: 'hly-seal-v1.signature',
      verificationToken: 'verification-token',
      signerName: null,
      includeFullText: true,
      includeEditHistory: true,
      accessCode: null,
      accessCodeHash: null,
      isProtected: false,
      generatedAt,
      pdfGenerated: false,
      pdfUrl: null,
      jsonUrl: null,
      createdAt: generatedAt,
    };
    mockQueryOne.mockResolvedValueOnce(certificate);

    await CertificateModel.create(certificate);

    const sql = mockQueryOne.mock.calls[0][0];
    const params = mockQueryOne.mock.calls[0][1] as unknown[];

    expect(sql).toContain('policy_hash');
    expect(sql).toContain('COALESCE($27::timestamptz, NOW())');
    expect(sql).not.toContain('$27::timestamp,');
    expect(params[17]).toBe('policy-hash');
    expect(params[26]).toBe(generatedAt);
  });
});
