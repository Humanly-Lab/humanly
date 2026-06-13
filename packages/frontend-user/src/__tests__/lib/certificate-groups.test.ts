import { groupCertificatesByDocument } from '@/lib/certificate-groups';
import type { Certificate } from '@humanly/shared';

function makeCertificate(
  id: string,
  documentId: string,
  title: string,
  generatedAt: string
): Certificate {
  return {
    id,
    documentId,
    userId: 'user-1',
    certificateType: 'full_authorship',
    title,
    documentSnapshot: {},
    plainTextSnapshot: '',
    totalEvents: 10,
    typingEvents: 10,
    pasteEvents: 0,
    totalCharacters: 100,
    typedCharacters: 100,
    pastedCharacters: 0,
    editingTimeSeconds: 60,
    signature: 'signature',
    verificationToken: `token-${id}`,
    includeFullText: true,
    includeEditHistory: true,
    isProtected: false,
    generatedAt: new Date(generatedAt),
    pdfGenerated: false,
    pdfUrl: null,
    jsonUrl: null,
    createdAt: new Date(generatedAt),
  };
}

describe('groupCertificatesByDocument', () => {
  it('groups certificates by document and sorts groups by newest certificate', () => {
    const groups = groupCertificatesByDocument([
      makeCertificate('old-a', 'doc-a', 'Research Reflection', '2026-06-01T12:00:00.000Z'),
      makeCertificate('new-b', 'doc-b', 'Peer Review', '2026-06-03T12:00:00.000Z'),
      makeCertificate('new-a', 'doc-a', 'Research Reflection', '2026-06-04T12:00:00.000Z'),
    ]);

    expect(groups.map((group) => group.documentId)).toEqual(['doc-a', 'doc-b']);
    expect(groups[0].latestCertificate.id).toBe('new-a');
    expect(groups[0].certificates.map((certificate) => certificate.id)).toEqual(['new-a', 'old-a']);
    expect(groups[1].latestCertificate.id).toBe('new-b');
  });
});
