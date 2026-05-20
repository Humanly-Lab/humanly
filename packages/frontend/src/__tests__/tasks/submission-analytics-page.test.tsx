import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import TaskSubmissionAnalyticsPage from '@/app/tasks/[id]/submissions/[submissionId]/page';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockApiGet = jest.fn();
let mockSearchParams = new URLSearchParams('from=analytics');

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

describe('admin submission analytics page', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockApiGet.mockReset();
    mockSearchParams = new URLSearchParams('from=analytics');
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        submission: submissionFixture,
        events: eventFixtures,
        totalEvents: eventFixtures.length,
      },
    });
  });

  it('shows per-submission analytics without session terminology', async () => {
    render(<TaskSubmissionAnalyticsPage />);

    expect(await screen.findByRole('heading', { name: 'Submission Analytics' })).toBeInTheDocument();
    expect(screen.getByText(/user@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Latest Essay/)).toBeInTheDocument();
    expect(screen.getByText('Events before submit')).toBeInTheDocument();
    expect(screen.getByText('Editing duration')).toBeInTheDocument();
    expect(screen.getByText('Typed characters')).toBeInTheDocument();
    expect(screen.getByText('Paste share')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Writing Activity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Composition' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Event Log' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Event' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Key / Detail' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cursor' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Before' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'After' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Certificate' })).toHaveAttribute('href', '/verify/cert-token-123');
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
});
