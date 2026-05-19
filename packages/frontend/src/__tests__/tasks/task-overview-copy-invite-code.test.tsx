import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import TaskDetailPage from '@/app/tasks/[id]/page';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockApiGet = jest.fn();
const mockClipboardWriteText = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useParams: () => ({
    id: 'task-123',
  }),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
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

const taskFixture = {
  id: 'task-123',
  userId: 'admin-123',
  name: 'Clipboard Task',
  description: 'Task details',
  taskToken: '9b0f63d3-0000-4000-9000-000000000000',
  userIdKey: 'email',
  externalServiceType: null,
  externalServiceUrl: null,
  allowedLlmModels: ['deepseek-ai/DeepSeek-V3'],
  aiUsageLimit: 100,
  startDate: new Date('2026-05-01T12:00:00.000Z'),
  endDate: new Date('2026-05-02T12:00:00.000Z'),
  environmentConfig: null,
  isActive: true,
  enrolledUserCount: 2,
  createdAt: new Date('2026-05-01T11:00:00.000Z'),
  updatedAt: new Date('2026-05-01T11:00:00.000Z'),
};

const statsFixture = {
  totalEvents: 0,
  totalSessions: 0,
  uniqueUsers: 0,
  totalUsers: 0,
  avgEventsPerSession: 0,
  avgSessionDuration: 0,
  completionRate: 0,
  activeUsers24h: 0,
};

const enrollmentsFixture = [
  {
    id: 'enrollment-1',
    taskId: 'task-123',
    userId: 'user-1',
    email: 'user@example.com',
    documentId: 'document-latest',
    documentTitle: 'Latest Essay',
    joinedAt: '2026-05-01T12:00:00.000Z',
    submissionCount: 2,
    eventCount: 42,
    lastActivity: '2026-05-15T01:58:00.000Z',
  },
  {
    id: 'enrollment-2',
    taskId: 'task-123',
    userId: 'user-2',
    email: 'quiet@example.com',
    documentId: null,
    documentTitle: null,
    joinedAt: '2026-05-02T12:00:00.000Z',
    submissionCount: 0,
    eventCount: 0,
    lastActivity: null,
  },
];

const submissionsFixture = [
  {
    id: 'submission-latest',
    userId: 'user-1',
    userEmail: 'user@example.com',
    documentId: 'document-latest',
    documentTitle: 'Latest Essay',
    certificateId: 'certificate-1',
    certificateVerificationToken: 'cert-token-123',
    submittedAt: '2026-05-15T01:58:00.000Z',
    status: 'active' as const,
  },
  {
    id: 'submission-older',
    userId: 'user-1',
    userEmail: 'user@example.com',
    documentId: 'document-older',
    documentTitle: 'Older Essay',
    certificateId: null,
    certificateVerificationToken: null,
    submittedAt: '2026-05-10T01:58:00.000Z',
    status: 'historical' as const,
  },
];

function mockTaskOverviewResponses() {
  mockApiGet.mockImplementation((url: string) => {
    if (url.endsWith('/analytics/summary')) {
      return Promise.resolve({ success: true, data: statsFixture });
    }

    if (url.endsWith('/enrollments')) {
      return Promise.resolve({ success: true, data: { enrollments: enrollmentsFixture } });
    }

    if (url.endsWith('/submissions')) {
      return Promise.resolve({ success: true, data: { submissions: submissionsFixture } });
    }

    return Promise.resolve({ success: true, data: taskFixture });
  });
}

describe('admin task overview invite code copy button', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockApiGet.mockReset();
    mockClipboardWriteText.mockReset();
    mockSearchParams = new URLSearchParams();
    mockTaskOverviewResponses();

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: mockClipboardWriteText,
      },
    });
  });

  it('copies the invite code and shows success feedback', async () => {
    mockClipboardWriteText.mockResolvedValueOnce(undefined);

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    fireEvent.click(screen.getByRole('button', { name: /copy invite code/i }));

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith('9B0F63');
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Invite code copied to clipboard.');
  });

  it('shows a recoverable error when clipboard permission is denied', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockClipboardWriteText.mockRejectedValueOnce(
      new DOMException('Write permission denied.', 'NotAllowedError')
    );

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    fireEvent.click(screen.getByRole('button', { name: /copy invite code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy the invite code. Select the code and copy it manually.'
    );
    expect(screen.getByRole('heading', { name: 'Clipboard Task' })).toBeInTheDocument();

    warnSpy.mockRestore();
  });

  it('opens the submission tab from query and shows latest submissions by default', async () => {
    mockSearchParams = new URLSearchParams('tab=submission');

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    expect(await screen.findByRole('heading', { name: /latest submissions/i })).toBeInTheDocument();
    const latestTable = screen.getByRole('table');
    expect(within(latestTable).getByText('user@example.com')).toBeInTheDocument();
    expect(within(latestTable).getByText('Latest Essay')).toBeInTheDocument();
    expect(screen.queryByText('Older Essay')).not.toBeInTheDocument();
    expect(within(latestTable).queryByText('quiet@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('No submission yet')).not.toBeInTheDocument();
    expect(screen.queryByText('One latest submission per enrolled user.')).not.toBeInTheDocument();
    expect(screen.queryByText('Select a user to inspect submission history.')).not.toBeInTheDocument();
    expect(screen.queryByText('user-1')).not.toBeInTheDocument();
    expect(screen.queryByText('user-2')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
    const submittedUserButton = screen.getByRole('button', { name: /user@example.com/i });
    const quietUserButton = screen.getByRole('button', { name: /quiet@example.com/i });
    expect(within(submittedUserButton).getByText('2 submissions')).toBeInTheDocument();
    expect(within(quietUserButton).getByText('No submissions yet')).toBeInTheDocument();
    expect(within(submittedUserButton).queryByText('Submissions')).not.toBeInTheDocument();

    fireEvent.click(submittedUserButton);

    expect(await screen.findByText('Older Essay')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /issued/i })).toHaveAttribute(
      'href',
      'http://localhost:3002/verify/cert-token-123'
    );

    fireEvent.click(quietUserButton);
    expect(await screen.findByRole('heading', { name: 'quiet@example.com' })).toBeInTheDocument();
    expect(screen.getByText('This user has not submitted a task document.')).toBeInTheDocument();
  });

  it('refreshes users and submissions together from the submission tab', async () => {
    mockSearchParams = new URLSearchParams('tab=submission');

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    const refreshButton = screen.getByRole('button', { name: /refresh submissions/i });

    expect(screen.queryByRole('button', { name: /^submissions$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /refresh submissions/i })).toHaveLength(1);

    mockApiGet.mockClear();
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/api/v1/tasks/task-123/enrollments');
      expect(mockApiGet).toHaveBeenCalledWith('/api/v1/tasks/task-123/submissions');
    });
  });

  it('shows the users tab as a read-only enrollment overview', async () => {
    mockSearchParams = new URLSearchParams('tab=users');

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    expect(await screen.findAllByRole('heading', { name: 'Enrolled Users' })).toHaveLength(2);
    expect(screen.getByText('Current Enrollments')).toBeInTheDocument();
    expect(screen.getByText('Total Submissions')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Submissions' })).toBeInTheDocument();

    expect(screen.queryByText('Inspect users enrolled in this task and open their submissions.')).not.toBeInTheDocument();
    expect(screen.queryByText('Click a user to view their latest submission and submission history.')).not.toBeInTheDocument();
    expect(screen.queryByText('user-1')).not.toBeInTheDocument();
    expect(screen.queryByText('user-2')).not.toBeInTheDocument();
    expect(screen.queryByText('No document yet')).not.toBeInTheDocument();

    const activeUserRow = screen.getByText('user@example.com').closest('tr');
    expect(activeUserRow).not.toBeNull();
    expect(within(activeUserRow!).getByText('2')).toBeInTheDocument();
    expect(within(activeUserRow!).getByText('42')).toBeInTheDocument();

    fireEvent.click(activeUserRow!);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('updates the task tab query when a tab is selected', async () => {
    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

    expect(mockReplace).toHaveBeenCalledWith('/tasks/task-123?tab=analytics', { scroll: false });
  });
});
