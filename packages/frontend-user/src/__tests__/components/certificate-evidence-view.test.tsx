import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CertificateEvidenceView } from '@/components/certificates/certificate-evidence-view';
import type { AIAuthorshipStats, WritingEnvironmentConfig } from '@humanly/shared';

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

const environmentConfig: WritingEnvironmentConfig = {
  preset: 'custom',
  taskType: 'personal',
  instructions: {
    hasInstructionPdf: false,
    editableAfterSubmission: true,
  },
  aiAccess: 'full',
  allowedModels: ['GPT-5'],
  customModels: [],
  aiTokenBudget: {
    shortcutMaxTokens: 1024,
    chatMaxTokens: 4096,
  },
  aiUsageLimit: {
    mode: 'max_requests',
    maxRequests: 20,
  },
  time: {
    timeLimitSeconds: 1800,
    lateSubmission: 'allowed',
  },
  submission: {
    mode: 'multiple',
    maxCharacters: 2000,
  },
  traceability: {
    trackAiUsage: true,
    trackTyping: true,
    trackCopyPaste: true,
    trackFocusBlur: true,
  },
  copyPastePolicy: 'allowed',
};

describe('CertificateEvidenceView', () => {
  it('renders the shared certificate evidence surface with collapsed authorship details and environment', async () => {
    const user = userEvent.setup();

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
          environmentConfig,
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
    expect(screen.getAllByRole('heading', { name: 'Authorship Statistics' })).toHaveLength(1);
    expect(screen.getByText('Typed / pasted / AI improvement composition')).toBeInTheDocument();
    expect(screen.getByText('AI improvements')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByText('Final Text')).toBeInTheDocument();
    expect(screen.getByText('Writing Time')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'AI Assistance' })).not.toBeInTheDocument();
    expect(screen.queryByText('AI improvement details')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Replay' })).toBeInTheDocument();
    expect(screen.getByTestId('document-replay')).toHaveTextContent('certificate-token');
    expect(screen.getByRole('heading', { name: 'Environment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Config' })).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('Allowed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Check more' }));

    expect(screen.getByText('AI improvement details')).toBeInTheDocument();
    expect(screen.getByText('Agent chat details')).toBeInTheDocument();
    expect(screen.getByText('Typed Characters')).toBeInTheDocument();
    expect(screen.getByText('Pasted Characters')).toBeInTheDocument();
    expect(screen.queryByText('Detailed breakdown of document authorship.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Certificate integrity' })).toBeInTheDocument();
  });
});
