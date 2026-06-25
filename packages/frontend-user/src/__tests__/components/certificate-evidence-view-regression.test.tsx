/**
 * @jest-environment-options {"customExportConditions":["node"]}
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  formatDisplayDateTime,
  type WritingEnvironmentConfig,
} from '@humanly/shared';
import {
  CertificateEvidenceView,
  type CertificateEvidenceRecord,
} from '@/components/certificates/certificate-evidence-view';

jest.mock('@/components/certificates/document-replay', () => ({
  DocumentReplay: () => <div data-testid="document-replay" />,
}));

const baseCertificate: CertificateEvidenceRecord = {
  id: 'certificate-environment',
  documentId: 'document-environment',
  title: 'Timed Task Submission',
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
};

function buildAdminEnvironmentConfig(
  time: Partial<WritingEnvironmentConfig['time']>
): WritingEnvironmentConfig {
  return {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    taskType: 'admin_assigned',
    aiUsageLimit: {
      mode: 'max_requests',
      maxRequests: 100,
    },
    time: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.time,
      lateSubmission: 'not_allowed',
      ...time,
    },
  };
}

async function renderAndOpenEnvironment(environmentConfig: WritingEnvironmentConfig) {
  const user = userEvent.setup();

  render(
    <CertificateEvidenceView
      certificate={{
        ...baseCertificate,
        environmentConfig,
      }}
    />
  );

  await user.click(screen.getByRole('button', { name: 'Show environment section' }));
}

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

describe('CertificateEvidenceView environment availability window', () => {
  const startTime = '2026-06-25T07:30:00.000Z';
  const endTime = '2026-07-09T07:30:00.000Z';

  it('formats valid task availability timestamps instead of exposing raw ISO text', async () => {
    await renderAndOpenEnvironment(buildAdminEnvironmentConfig({ startTime, endTime }));

    expect(
      screen.getByText(`${formatDisplayDateTime(startTime)} to ${formatDisplayDateTime(endTime)}`)
    ).toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(startTime))).not.toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(endTime))).not.toBeInTheDocument();
  });

  it('formats partial task availability windows without a dangling range', async () => {
    await renderAndOpenEnvironment(buildAdminEnvironmentConfig({ startTime }));

    expect(screen.getByText(`Opens ${formatDisplayDateTime(startTime)}`)).toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(startTime))).not.toBeInTheDocument();
  });

  it('formats end-only task availability windows without a dangling range', async () => {
    await renderAndOpenEnvironment(buildAdminEnvironmentConfig({ endTime }));

    expect(screen.getByText(`Closes ${formatDisplayDateTime(endTime)}`)).toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(endTime))).not.toBeInTheDocument();
  });

  it('hides invalid task availability values behind a safe fallback', async () => {
    const invalidStart = 'not-a-date';
    const invalidEnd = 'also-not-a-date';

    await renderAndOpenEnvironment(buildAdminEnvironmentConfig({
      startTime: invalidStart,
      endTime: invalidEnd,
    }));

    expect(screen.getByText('Availability window unavailable')).toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(invalidStart))).not.toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(invalidEnd))).not.toBeInTheDocument();
  });
});
