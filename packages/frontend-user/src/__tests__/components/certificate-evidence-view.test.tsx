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
    mode: 'time_restricted',
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
          editingTimeSeconds: 1820,
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
          signedFields: ['certificateId', 'metrics.totalEvents'],
        }}
        integrityMessage="Certificate seal is valid"
      />
    );

    expect(screen.getByRole('heading', { name: 'Research Reflection' })).toBeInTheDocument();
    expect(screen.queryByText('100% Human Created')).not.toBeInTheDocument();
    expect(screen.getByText('Certificate seal')).toBeInTheDocument();
    expect(screen.getByText('Seal verified')).toBeInTheDocument();
    expect(screen.getByText('Server-issued seal matches this certificate record.')).toBeInTheDocument();
    expect(screen.queryByText('Payload hash')).not.toBeInTheDocument();
    expect(screen.queryByText('1234567890ab...567890abcdef')).not.toBeInTheDocument();
    expect(screen.queryByText('Algorithm')).not.toBeInTheDocument();
    expect(screen.queryByText('HMAC-SHA256')).not.toBeInTheDocument();
    expect(screen.queryByText('Key ID')).not.toBeInTheDocument();
    expect(screen.queryByText('humanly-server-v1')).not.toBeInTheDocument();
    expect(screen.queryByText('Signed fields')).not.toBeInTheDocument();
    expect(screen.getByText('More seal details')).toBeInTheDocument();
    expect(screen.queryByText('Certificate integrity')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Authorship Statistics' })).toHaveLength(1);
    expect(screen.getByText('Typed / pasted / AI improvement composition')).toBeInTheDocument();
    expect(screen.getByText('AI improvements')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByText('Final Text')).toBeInTheDocument();
    expect(screen.getByText('Writing Time')).toBeInTheDocument();
    expect(screen.getByText('30min20s')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'AI Assistance' })).not.toBeInTheDocument();
    expect(screen.queryByText('AI improvement details')).not.toBeInTheDocument();
    const sectionTitles = [
      screen.getByRole('heading', { name: 'Authorship Statistics' }),
      screen.getByRole('heading', { name: 'Replay' }),
      screen.getByRole('heading', { name: 'Environment' }),
    ];
    sectionTitles.forEach((title) => {
      expect(title).toHaveClass('text-lg');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('tracking-normal');
    });
    expect(screen.queryByTestId('document-replay')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download Config' })).not.toBeInTheDocument();
    expect(screen.queryByText('Personal writing')).not.toBeInTheDocument();
    expect(screen.queryByText('Writing time limit')).not.toBeInTheDocument();
    expect(screen.queryByText('Submission mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Multiple submissions')).not.toBeInTheDocument();
    expect(screen.getByText('See more')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show certificate seal details' }));

    expect(screen.getByText('Payload hash')).toBeInTheDocument();
    expect(screen.getByText('1234567890ab...567890abcdef')).toBeInTheDocument();
    expect(screen.getByText('Algorithm')).toBeInTheDocument();
    expect(screen.getByText('HMAC-SHA256')).toBeInTheDocument();
    expect(screen.getByText('Key ID')).toBeInTheDocument();
    expect(screen.getByText('humanly-server-v1')).toBeInTheDocument();
    expect(screen.getByText('Signed fields')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Certificate integrity')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This certificate was checked against the Humanly server-issued integrity seal for the protected certificate record, including the writing metrics, document identity, generated timestamp, and current display options.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Certificate seal is valid')).toBeInTheDocument();
    expect(screen.getByText('Less seal details')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show more authorship details' }));

    expect(screen.queryByText('See more')).not.toBeInTheDocument();
    expect(screen.getByText('See less')).toBeInTheDocument();
    expect(screen.getByText('AI improvement details')).toBeInTheDocument();
    expect(screen.getByText('Agent chat details')).toBeInTheDocument();
    expect(screen.getByText('Typed Characters')).toBeInTheDocument();
    expect(screen.getByText('Pasted Characters')).toBeInTheDocument();
    expect(
      screen.getByText('See less').compareDocumentPosition(screen.getByText('Agent chat details'))
        & Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy();
    expect(screen.queryByText('Character composition')).not.toBeInTheDocument();
    expect(screen.queryByText('Detailed breakdown of document authorship.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show replay section' }));

    expect(screen.getByTestId('document-replay')).toHaveTextContent('certificate-token');

    await user.click(screen.getByRole('button', { name: 'Show environment section' }));

    expect(screen.getByRole('button', { name: 'Download Config' })).toBeInTheDocument();
    expect(screen.getByText('Personal writing')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('Quick-action token limit')).toBeInTheDocument();
    expect(screen.getByText('1,024 tokens')).toBeInTheDocument();
    expect(screen.getByText('Agent chat token limit')).toBeInTheDocument();
    expect(screen.getByText('4,096 tokens')).toBeInTheDocument();
    expect(screen.getByText('Allowed')).toBeInTheDocument();
    expect(screen.getByText('Writing time limit')).toBeInTheDocument();
    expect(screen.getByText('30min')).toBeInTheDocument();
    expect(screen.getByText('Maximum characters')).toBeInTheDocument();
    expect(screen.queryByText('Screen recording')).not.toBeInTheDocument();
    expect(screen.queryByText('Camera recording')).not.toBeInTheDocument();
  });

  it('shows assignment-only environment rows for admin-assigned certificates', async () => {
    const user = userEvent.setup();

    render(
      <CertificateEvidenceView
        certificate={{
          id: 'certificate-2',
          documentId: 'document-2',
          title: 'Assigned Review',
          certificateType: 'full_authorship',
          generatedAt: '2026-06-10T12:00:00.000Z',
          totalCharacters: 100,
          typedCharacters: 80,
          pastedCharacters: 20,
          totalEvents: 10,
          typingEvents: 8,
          pasteEvents: 2,
          editingTimeSeconds: 1820,
          includeEditHistory: false,
          environmentConfig: {
            ...environmentConfig,
            taskType: 'admin_assigned',
            aiUsageLimit: {
              mode: 'max_requests',
              maxRequests: 20,
            },
            time: {
              startTime: '2026-06-10T12:00:00.000Z',
              endTime: '2026-06-11T12:00:00.000Z',
              timeLimitSeconds: 1800,
              lateSubmission: 'not_allowed',
            },
            submission: {
              mode: 'single',
              minCharacters: 100,
              maxCharacters: 2000,
            },
          },
        }}
        aiStats={aiStats}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show environment section' }));

    expect(screen.getByText('Assigned task')).toBeInTheDocument();
    expect(screen.getByText('AI limit')).toBeInTheDocument();
    expect(screen.getByText('20 requests')).toBeInTheDocument();
    expect(screen.getByText('Availability window')).toBeInTheDocument();
    expect(screen.getByText('Character limit')).toBeInTheDocument();
    expect(screen.getByText('100 - 2,000 chars')).toBeInTheDocument();
    expect(screen.getByText('Submission mode')).toBeInTheDocument();
    expect(screen.getByText('Single submission')).toBeInTheDocument();
    expect(screen.queryByText('Maximum characters')).not.toBeInTheDocument();
  });

  it('shows recording environment rows only when recording notices were configured', async () => {
    const user = userEvent.setup();

    render(
      <CertificateEvidenceView
        certificate={{
          id: 'certificate-recording',
          documentId: 'document-recording',
          title: 'Recorded Environment',
          certificateType: 'full_authorship',
          generatedAt: '2026-06-10T12:00:00.000Z',
          totalCharacters: 100,
          typedCharacters: 80,
          pastedCharacters: 20,
          totalEvents: 10,
          typingEvents: 8,
          pasteEvents: 2,
          editingTimeSeconds: 1820,
          includeEditHistory: false,
          environmentConfig: {
            ...environmentConfig,
            traceability: {
              ...environmentConfig.traceability,
              requireScreenRecording: true,
              requireCameraRecording: true,
            },
          },
        }}
        aiStats={aiStats}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show environment section' }));

    expect(screen.getByText('Screen recording')).toBeInTheDocument();
    expect(screen.getByText('Camera recording')).toBeInTheDocument();
    expect(screen.getAllByText('Expected by environment')).toHaveLength(2);
  });

  it('does not show AI token budget rows when AI access is off', async () => {
    const user = userEvent.setup();

    render(
      <CertificateEvidenceView
        certificate={{
          id: 'certificate-3',
          documentId: 'document-3',
          title: 'No AI Draft',
          certificateType: 'full_authorship',
          generatedAt: '2026-06-10T12:00:00.000Z',
          totalCharacters: 100,
          typedCharacters: 100,
          pastedCharacters: 0,
          totalEvents: 10,
          typingEvents: 10,
          pasteEvents: 0,
          editingTimeSeconds: 120,
          includeEditHistory: false,
          environmentConfig: {
            ...environmentConfig,
            aiAccess: 'off',
            allowedModels: [],
          },
        }}
        aiStats={aiStats}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show environment section' }));

    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.queryByText('AI model')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick-action token limit')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent chat token limit')).not.toBeInTheDocument();
    expect(screen.queryByText('1,024 tokens')).not.toBeInTheDocument();
    expect(screen.queryByText('4,096 tokens')).not.toBeInTheDocument();
  });

  it('labels tiny nonzero composition shares as less than one percent', () => {
    render(
      <CertificateEvidenceView
        certificate={{
          id: 'certificate-4',
          documentId: 'document-4',
          title: 'Tiny Paste Share',
          certificateType: 'full_authorship',
          generatedAt: '2026-06-10T12:00:00.000Z',
          totalCharacters: 1000,
          typedCharacters: 999,
          pastedCharacters: 1,
          totalEvents: 262,
          typingEvents: 261,
          pasteEvents: 1,
          editingTimeSeconds: 120,
          includeEditHistory: false,
          environmentConfig,
        }}
        aiStats={{
          ...aiStats,
          selectionActions: {
            ...aiStats.selectionActions,
            total: 0,
            grammarFixes: 0,
            improveWriting: 0,
            makeFormal: 0,
            accepted: 0,
            rejected: 0,
            acceptanceRate: 0,
          },
        }}
      />
    );

    expect(screen.getByText('<1%')).toBeInTheDocument();
    expect(screen.queryByText('Pasted 0%')).not.toBeInTheDocument();
  });
});
