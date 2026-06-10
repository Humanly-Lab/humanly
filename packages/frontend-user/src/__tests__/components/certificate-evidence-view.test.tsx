import { render, screen } from '@testing-library/react';
import { CertificateEvidenceView } from '@/components/certificates/certificate-evidence-view';
import type { AIAuthorshipStats } from '@humanly/shared';

jest.mock('@/components/certificates/document-replay', () => ({
  DocumentReplay: ({ token }: { token: string }) => (
    <div data-testid="document-replay">Replay token: {token}</div>
  ),
}));

const aiStats: AIAuthorshipStats = {
  selectionActions: {
    total: 3,
    grammarFixes: 1,
    improveWriting: 1,
    simplify: 0,
    makeFormal: 1,
    accepted: 2,
    rejected: 1,
    acceptanceRate: 66.7,
  },
  aiQuestions: {
    total: 2,
    understanding: 1,
    generation: 1,
    other: 0,
  },
};

describe('CertificateEvidenceView', () => {
  it('renders the shared certificate evidence surface with AI assistance and replay', () => {
    render(
      <CertificateEvidenceView
        certificate={{
          id: 'certificate-1',
          documentId: 'document-1',
          title: 'Research Reflection',
          certificateType: 'full_authorship',
          generatedAt: '2026-06-10T12:00:00.000Z',
          totalCharacters: 100,
          typedCharacters: 80,
          pastedCharacters: 20,
          totalEvents: 10,
          typingEvents: 8,
          pasteEvents: 2,
          editingTimeSeconds: 120,
          includeEditHistory: true,
          signerName: 'Test Writer',
        }}
        aiStats={aiStats}
        replayToken="certificate-token"
        sealStatus="valid"
        seal={{
          version: 'hly-seal-v1',
          algorithm: 'HMAC-SHA256',
          keyId: 'humanly-server-v1',
          payloadHash: '1234567890abcdef1234567890abcdef1234567890abcdef',
          signature: 'hly-seal-v1.signature',
          signedFields: [],
        }}
        integrityMessage="Certificate seal is valid"
      />
    );

    expect(screen.getByRole('heading', { name: 'Research Reflection' })).toBeInTheDocument();
    expect(screen.getByText('Seal verified')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI Assistance' })).toBeInTheDocument();
    expect(screen.getByText('Text Improvements')).toBeInTheDocument();
    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Replay' })).toBeInTheDocument();
    expect(screen.getByTestId('document-replay')).toHaveTextContent('certificate-token');
    expect(screen.getByRole('heading', { name: 'Authorship Statistics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Certificate integrity' })).toBeInTheDocument();
  });
});
