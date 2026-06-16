/**
 * @jest-environment-options {"customExportConditions":["node"]}
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CertificateEvidenceView } from '@/components/certificates/certificate-evidence-view';

jest.mock('@/components/certificates/document-replay', () => ({
  DocumentReplay: () => <div data-testid="document-replay" />,
}));

describe('CertificateEvidenceView review signals', () => {
  it('does not expose internal refusal event names in certificate evidence', async () => {
    const user = userEvent.setup();

    render(
      <CertificateEvidenceView
        certificate={{
          id: 'certificate-refusal',
          documentId: 'document-refusal',
          title: 'Policy Guard Draft',
          certificateType: 'full_authorship',
          generatedAt: '2026-06-10T12:00:00.000Z',
          totalCharacters: 1000,
          typedCharacters: 1000,
          pastedCharacters: 0,
          totalEvents: 140,
          typingEvents: 140,
          pasteEvents: 0,
          editingTimeSeconds: 45,
          includeEditHistory: false,
          anomalyFlags: [
            {
              code: 'ai_policy_refusal',
              severity: 'warning',
              label: 'AI policy refusals',
              description:
                'The in-platform assistant refused a request because it conflicted with the active writing policy.',
              evidence: {
                refusalCount: 2,
                eventType: 'ai_policy_refusal',
              },
            },
          ],
        }}
        aiStats={{
          selectionActions: {
            total: 0,
            grammarFixes: 0,
            improveWriting: 0,
            simplify: 0,
            makeFormal: 0,
            accepted: 0,
            rejected: 0,
            acceptanceRate: 0,
          },
          aiQuestions: {
            total: 0,
            understanding: 0,
            generation: 0,
            other: 0,
          },
          policyRefusals: {
            total: 2,
          },
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show abnormal behavior review section' }));

    expect(screen.getByText('Chat refusals')).toBeInTheDocument();
    expect(screen.getByText('Refusal Count')).toBeInTheDocument();
    expect(screen.queryByText('Event Type')).not.toBeInTheDocument();
    expect(screen.queryByText('ai_policy_refusal')).not.toBeInTheDocument();
  });
});
