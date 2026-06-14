import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import TaskSubmissionAnalyticsPage from '@/app/tasks/[id]/submissions/[submissionId]/page';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockApiGet = jest.fn();
let mockSearchParams = new URLSearchParams('from=analytics');
const originalLocation = window.location;
const originalFrontendUserUrl = process.env.NEXT_PUBLIC_FRONTEND_USER_URL;

jest.mock('next/navigation', () => ({
  useParams: () => ({
    id: 'task-123',
    submissionId: 'submission-latest',
  }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockApiGet(...args),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
    }
  },
}));

const submissionFixture = {
  id: 'submission-latest',
  userEmail: 'user@example.com',
  documentId: 'document-latest',
  documentTitle: 'Latest Essay',
  certificateVerificationToken: 'cert-token-123',
  submittedAt: '2026-05-15T01:58:00.000Z',
  anomalyFlags: [
    {
      code: 'uniform_key_cadence',
      severity: 'warning',
      label: 'Uniform key cadence',
      description: 'Key intervals were unusually uniform.',
      evidence: { intervalCount: 42 },
    },
    {
      code: 'sustained_high_typing_speed',
      severity: 'warning',
      label: 'Sustained high typing speed',
      description: 'Typing speed stayed above the configured review threshold.',
      evidence: { peakCharactersPerMinute: 2400 },
    },
  ],
  status: 'active' as const,
};

const eventFixtures = [
  {
    id: 'event-1',
    eventType: 'input',
    timestamp: '2026-05-15T01:50:00.000Z',
    keyCode: 'KeyH',
    keyChar: 'h',
    textBefore: '',
    textAfter: 'Hello',
    cursorPosition: 5,
    metadata: null,
  },
  {
    id: 'event-2',
    eventType: 'paste',
    timestamp: '2026-05-15T01:51:00.000Z',
    keyCode: null,
    keyChar: null,
    textBefore: 'Hello',
    textAfter: 'Hello pasted text',
    cursorPosition: 17,
    metadata: null,
  },
  {
    id: 'event-3',
    eventType: 'focus',
    timestamp: '2026-05-15T01:52:00.000Z',
    keyCode: null,
    keyChar: null,
    textBefore: 'Hello pasted text',
    textAfter: 'Hello pasted text',
    cursorPosition: null,
    metadata: null,
  },
];

const timelineFixtures = [
  {
    id: 'timeline-typing',
    kind: 'typing_burst',
    label: 'Typed',
    timestamp: '2026-05-15T01:50:00.000Z',
    startTimestamp: '2026-05-15T01:50:00.000Z',
    endTimestamp: '2026-05-15T01:50:00.000Z',
    text: 'Hello',
    charCount: 5,
    wordCount: 1,
    rawEventCount: 1,
    rawEvents: [
      {
        id: 'event-1',
        eventType: 'input',
        timestamp: '2026-05-15T01:50:00.000Z',
        insertedText: 'Hello',
        cursorPosition: 5,
      },
    ],
  },
  {
    id: 'timeline-paste',
    kind: 'paste',
    label: 'Pasted',
    timestamp: '2026-05-15T01:51:00.000Z',
    startTimestamp: '2026-05-15T01:51:00.000Z',
    endTimestamp: '2026-05-15T01:51:00.000Z',
    text: 'pasted text',
    charCount: 12,
    wordCount: 2,
    rawEventCount: 1,
    rawEvents: [
      {
        id: 'event-2',
        eventType: 'paste',
        timestamp: '2026-05-15T01:51:00.000Z',
        insertedText: 'pasted text',
        cursorPosition: 17,
      },
    ],
  },
];

const aiLogFixtures = [
  {
    id: 'ai-log-1',
    documentId: 'document-latest',
    userId: 'user-123',
    timestamp: '2026-05-15T01:51:30.000Z',
    query: 'Improve this sentence',
    queryType: 'rewrite',
    contextSnapshot: {
      selection: {
        text: 'Hello',
        startOffset: 0,
        endOffset: 5,
      },
    },
    response: 'Hello there',
    modificationsApplied: true,
    modifications: [
      {
        before: 'Hello',
        after: 'Hello there',
        startOffset: 0,
        endOffset: 5,
      },
    ],
    status: 'success',
    createdAt: '2026-05-15T01:51:30.000Z',
  },
];

describe('admin submission analytics page', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockApiGet.mockReset();
    delete process.env.NEXT_PUBLIC_FRONTEND_USER_URL;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://admin.writehumanly.net/tasks/task-123/submissions/submission-latest'),
    });
    mockSearchParams = new URLSearchParams('from=analytics');
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        submission: submissionFixture,
        events: eventFixtures,
        totalEvents: eventFixtures.length,
        timeline: {
          items: timelineFixtures,
        },
        aiLogs: aiLogFixtures,
      },
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_FRONTEND_USER_URL = originalFrontendUserUrl;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('shows per-submission analytics without session terminology', async () => {
    render(<TaskSubmissionAnalyticsPage />);

    expect(await screen.findByRole('heading', { name: 'Submission Analytics' })).toBeInTheDocument();
    expect(screen.getByText(/user@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Latest Essay/)).toBeInTheDocument();
    expect(screen.getByText('Events before submit')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review Signals' })).toBeInTheDocument();
    expect(screen.getByText('warning · Rapid text accumulation')).toBeInTheDocument();
    expect(screen.queryByText('warning · Uniform key cadence')).not.toBeInTheDocument();
    expect(screen.getByText('Editing duration')).toBeInTheDocument();
    expect(screen.getByText('Typed characters')).toBeInTheDocument();
    expect(screen.getByText('Paste share')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Writing Activity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Composition' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Event Log' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Text / Detail' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Count' })).toBeInTheDocument();
    expect(screen.getByText('Typed')).toBeInTheDocument();
    expect(screen.getByText('Pasted')).toBeInTheDocument();
    expect(screen.getByText('Improve writing')).toBeInTheDocument();
    expect(screen.queryByText('Event Summary')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Before' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'After' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Certificate' })).toHaveAttribute(
      'href',
      'https://app.writehumanly.net/verify/cert-token-123'
    );
    expect(screen.queryByText(/session/i)).not.toBeInTheDocument();
  });

  it('returns to the task analytics tab when opened from analytics', async () => {
    render(<TaskSubmissionAnalyticsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /back to analytics/i }));

    expect(mockPush).toHaveBeenCalledWith('/tasks/task-123?tab=analytics');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('returns to the task submission tab when opened from submission', async () => {
    mockSearchParams = new URLSearchParams('from=submission');

    render(<TaskSubmissionAnalyticsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /back to submission/i }));

    expect(mockPush).toHaveBeenCalledWith('/tasks/task-123?tab=submission');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('falls back to browser history outside analytics flow', async () => {
    mockSearchParams = new URLSearchParams();

    render(<TaskSubmissionAnalyticsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /^back$/i }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('refreshes the submission analytics events', async () => {
    render(<TaskSubmissionAnalyticsPage />);

    await screen.findByRole('heading', { name: 'Submission Analytics' });
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledTimes(2);
    });
    expect(mockApiGet).toHaveBeenCalledWith('/api/v1/tasks/task-123/submissions/submission-latest/events');
  });

  it('shows copied text in raw event rows and expands long copied text', async () => {
    const longCopiedText = [
      'This copied submission paragraph is long enough to need a compact preview first.',
      'The admin hidden copy evidence phrase should only appear after expansion.',
      'The copied text keeps line breaks for review.',
    ].join('\n');

    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: {
        submission: submissionFixture,
        events: [],
        totalEvents: 0,
        timeline: {
          items: [
            {
              id: 'raw-copy-long',
              kind: 'event',
              label: 'Copied text',
              timestamp: '2026-05-15T01:53:00.000Z',
              startTimestamp: '2026-05-15T01:53:00.000Z',
              endTimestamp: '2026-05-15T01:53:00.000Z',
              text: '',
              rawEventCount: 1,
              rawEvents: [
                {
                  id: 'raw-copy-long-event',
                  eventType: 'copy',
                  timestamp: '2026-05-15T01:53:00.000Z',
                  cursorPosition: 24,
                  metadata: {
                    copiedText: longCopiedText,
                    copiedCharacterCount: longCopiedText.length,
                    copiedLineCount: 3,
                  },
                },
              ],
            },
          ],
        },
        aiLogs: [],
      },
    });

    render(<TaskSubmissionAnalyticsPage />);

    expect(await screen.findByText(/3 lines copied/)).toBeInTheDocument();
    expect(screen.queryByText(/admin hidden copy evidence phrase/)).not.toBeInTheDocument();

    const viewFullTextButton = screen.getByRole('button', { name: 'View full text' });
    expect(screen.queryByRole('button', { name: 'View Full Text' })).not.toBeInTheDocument();

    fireEvent.click(viewFullTextButton);

    expect(await screen.findByText('Copied text')).toBeInTheDocument();
    expect(screen.getByText(/admin hidden copy evidence phrase/)).toBeInTheDocument();
  });
});
