/**
 * @jest-environment-options {"customExportConditions":["node"]}
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  formatDisplayDateTime,
  formatDisplayTimestamp,
  type WritingEnvironmentConfig,
} from '@humanly/shared';
import {
  CertificateEvidenceView,
  type CertificateEvidenceRecord,
} from '@/components/certificates/certificate-evidence-view';

jest.mock('@/components/certificates/document-replay', () => ({
  DocumentReplay: () => <div data-testid="document-replay" />,
}));

function mockLocalTimeZone(timeZone: string) {
  const realDateTimeFormat = Intl.DateTimeFormat;

  jest
    .spyOn(Intl, 'DateTimeFormat')
    .mockImplementation(((locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) => {
      const formatter = new realDateTimeFormat(locales, options);
      const resolvedOptions = formatter.resolvedOptions.bind(formatter);

      Object.defineProperty(formatter, 'resolvedOptions', {
        configurable: true,
        value: () => ({
          ...resolvedOptions(),
          timeZone,
        }),
      });

      return formatter;
    }) as typeof Intl.DateTimeFormat);
}

afterEach(() => {
  jest.restoreAllMocks();
});

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

  it('formats anomaly timestamp evidence without exposing raw ISO text', async () => {
    const user = userEvent.setup();
    const blurTimestamp = '2026-06-25T20:40:23.000Z';
    const focusTimestamp = '2026-06-25T20:41:08.000Z';
    const windowStart = '2026-06-25T20:40:00.000Z';
    const windowEnd = '2026-06-25T20:42:00.000Z';

    render(
      <CertificateEvidenceView
        certificate={{
          ...baseCertificate,
          anomalyFlags: [
            {
              code: 'rapid_text_accumulation',
              severity: 'warning',
              label: 'Rapid text accumulation',
              description: 'A large amount of text appeared within a short time window.',
              evidence: {
                blurTimestamp,
                focusTimestamp,
                windowStart,
                windowEnd,
                refocusAddedCharacters: 433,
              },
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show abnormal behavior review section' }));

    expect(screen.getByText('Blur Timestamp')).toBeInTheDocument();
    expect(screen.getByText(formatDisplayTimestamp(blurTimestamp, { locale: 'en-US' }))).toBeInTheDocument();
    expect(screen.getByText(formatDisplayTimestamp(focusTimestamp, { locale: 'en-US' }))).toBeInTheDocument();
    expect(screen.getByText(formatDisplayTimestamp(windowStart, { locale: 'en-US' }))).toBeInTheDocument();
    expect(screen.getByText(formatDisplayTimestamp(windowEnd, { locale: 'en-US' }))).toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(blurTimestamp))).not.toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(focusTimestamp))).not.toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(windowStart))).not.toBeInTheDocument();
    expect(screen.queryByText((content) => content.includes(windowEnd))).not.toBeInTheDocument();
  });
});

describe('CertificateEvidenceView environment availability window', () => {
  const startTime = '2026-06-25T07:30:00.000Z';
  const endTime = '2026-07-09T07:30:00.000Z';

  it('shows the viewer local timezone context only after expanding the environment section', async () => {
    mockLocalTimeZone('Asia/Shanghai');
    const user = userEvent.setup();

    render(
      <CertificateEvidenceView
        certificate={{
          ...baseCertificate,
          environmentConfig: buildAdminEnvironmentConfig({ startTime, endTime }),
        }}
      />
    );

    expect(screen.queryByText('Times shown in your local timezone: Asia/Shanghai')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show environment section' }));

    expect(screen.getByText('Times shown in your local timezone: Asia/Shanghai')).toBeInTheDocument();
  });

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
