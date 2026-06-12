import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import TaskDetailPage from '@/app/tasks/[id]/page';
import { getAnalyticsDateRange } from '@/app/tasks/[id]/_components/AnalyticsPanel';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockApiGet = jest.fn();
const mockApiPut = jest.fn();
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();
const mockClipboardWriteText = jest.fn();
const mockDownloadBlob = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockAiSettings: any = null;

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
  api: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
    post: (...args: any[]) => mockApiPost(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
    }
  },
}));

jest.mock('@/lib/download', () => ({
  downloadBlob: (...args: any[]) => mockDownloadBlob(...args),
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
  environmentConfig: {
    taskType: 'admin_assigned',
    preset: 'custom',
    description: undefined,
    aiAccess: 'full',
    aiProvider: {
      provider: 'together',
      baseUrl: 'https://api.together.xyz/v1',
    },
    allowedModels: ['moonshotai/Kimi-K2.6'],
    customModels: [],
    instructions: {
      hasInstructionPdf: false,
      editableAfterSubmission: true,
    },
    aiUsageLimit: {
      mode: 'max_requests',
      maxRequests: 100,
    },
    aiTokenBudget: {
      shortcutMaxTokens: 1024,
      chatMaxTokens: 4096,
    },
    time: {
      startTime: '2026-05-01T12:00:00.000Z',
      endTime: '2026-05-02T12:00:00.000Z',
      timeLimitSeconds: 30 * 60,
      lateSubmission: 'not_allowed',
    },
    submission: {
      mode: 'multiple',
    },
    traceability: {
      trackAiUsage: true,
      trackTyping: true,
      trackCopyPaste: true,
      trackFocusBlur: true,
    },
    copyPastePolicy: 'allowed',
  },
  allowGuestSubmissions: true,
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

const eventsTimelineFixture = [
  { date: 'May 13', eventCount: 12 },
  { date: 'May 14', eventCount: 18 },
  { date: 'May 15', eventCount: 24 },
];

const eventTypesFixture = [
  { eventType: 'input', count: 30, percentage: 50 },
  { eventType: 'paste', count: 12, percentage: 20 },
  { eventType: 'copy', count: 6, percentage: 10 },
  { eventType: 'focus', count: 12, percentage: 20 },
];

const adminLocalTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const localTimeZoneLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';

function mockTaskOverviewResponses(task = taskFixture) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/ai/settings') {
      return Promise.resolve({ success: true, data: mockAiSettings });
    }

    if (url.endsWith('/files')) {
      return Promise.resolve({ success: true, data: [] });
    }

    if (url.endsWith('/analytics/summary')) {
      return Promise.resolve({ success: true, data: statsFixture });
    }

    if (url.endsWith('/analytics/events-timeline')) {
      return Promise.resolve({ success: true, data: { timeline: eventsTimelineFixture } });
    }

    if (url.endsWith('/analytics/event-types')) {
      return Promise.resolve({ success: true, data: { eventTypes: eventTypesFixture } });
    }

    if (url.endsWith('/enrollments')) {
      return Promise.resolve({ success: true, data: { enrollments: enrollmentsFixture } });
    }

    if (url.endsWith('/submissions')) {
      return Promise.resolve({ success: true, data: { submissions: submissionsFixture } });
    }

    return Promise.resolve({ success: true, data: task });
  });
}

function readBlobAsText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function openEnvironmentDialog() {
  fireEvent.click(screen.getByRole('button', { name: /edit environment/i }));
  return screen.findByRole('dialog', { name: /edit environment/i });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('admin task overview invite code copy button', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockApiGet.mockReset();
    mockApiPut.mockReset();
    mockApiPost.mockReset();
    mockApiDelete.mockReset();
    mockClipboardWriteText.mockReset();
    mockDownloadBlob.mockReset();
    mockSearchParams = new URLSearchParams();
    mockAiSettings = {
      hasApiKey: true,
      maskedApiKey: 'sk-...1234',
      baseUrl: 'https://api.together.xyz/v1',
    };
    mockTaskOverviewResponses();
    mockApiPut.mockImplementation((url: string) => {
      if (url === '/api/v1/ai/settings') {
        return Promise.resolve({ success: true });
      }

      if (url === '/api/v1/tasks/task-123') {
        return Promise.resolve({
          success: true,
          data: taskFixture,
          message: 'Task updated',
        });
      }

      return Promise.resolve({ success: true });
    });
    mockApiPost.mockResolvedValue({ success: true, message: 'Connection successful.', models: ['moonshotai/Kimi-K2.6'] });
    mockApiDelete.mockResolvedValue({ success: true });

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

    const taskHeading = await screen.findByRole('heading', { name: 'Clipboard Task' });
    expect(taskHeading).toHaveAttribute('title', 'Clipboard Task');
    expect(taskHeading).toHaveClass('line-clamp-2');
    expect(taskHeading).toHaveClass('break-words');
    const overviewRegion = screen.getByText('Task Overview').closest('.rounded-lg');
    expect(overviewRegion).not.toBeNull();
    expect(within(overviewRegion as HTMLElement).getByText(
      adminLocalTimeFormatter.format(taskFixture.createdAt)
    )).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText(
      adminLocalTimeFormatter.format(taskFixture.startDate)
    )).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText(
      adminLocalTimeFormatter.format(taskFixture.endDate)
    )).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText(
      `Times shown in your local timezone: ${localTimeZoneLabel}`
    )).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).queryByText('Instruction Files')).not.toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).queryByText('Ready for task files API')).not.toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).queryByText('External Service')).not.toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('Copy & Paste')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('Allowed')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('Writing Session')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('30 minutes')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('Final Submission Length')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('No limit')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('AI Access')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('Enabled')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('AI Model')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('Together AI')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('moonshotai/Kimi-K2.6')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).queryByText('deepseek-ai/DeepSeek-V3')).not.toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('AI Usage Limit')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('100 requests per user')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /copy invite code/i }));

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith('9B0F63');
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Invite code copied to clipboard.');
  });

  it('copies the public task share link and explains anonymous access', async () => {
    mockClipboardWriteText.mockResolvedValueOnce(undefined);

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    expect(screen.getByText('Public Share Link')).toBeInTheDocument();
    expect(screen.getByText('Anyone with this link can write and submit without registering.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /copy public share link/i }));

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        'http://localhost:3002/tasks/public/9b0f63d3-0000-4000-9000-000000000000'
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Share link copied to clipboard.');
  });

  it('explains when public share links require sign-in', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/v1/ai/settings') {
        return Promise.resolve({ success: true, data: mockAiSettings });
      }

      if (url.endsWith('/files')) {
        return Promise.resolve({ success: true, data: [] });
      }

      if (url.endsWith('/analytics/summary')) {
        return Promise.resolve({ success: true, data: statsFixture });
      }

      if (url.endsWith('/enrollments')) {
        return Promise.resolve({ success: true, data: { enrollments: enrollmentsFixture } });
      }

      if (url.endsWith('/submissions')) {
        return Promise.resolve({ success: true, data: { submissions: submissionsFixture } });
      }

      return Promise.resolve({
        success: true,
        data: {
          ...taskFixture,
          allowGuestSubmissions: false,
        },
      });
    });

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    expect(screen.getByText('Visitors must sign in or create an account before writing from this link.')).toBeInTheDocument();
  });

  it('renders overview writing rules for legacy environment configs without time settings', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/v1/ai/settings') {
        return Promise.resolve({ success: true, data: mockAiSettings });
      }

      if (url.endsWith('/files')) {
        return Promise.resolve({ success: true, data: [] });
      }

      if (url.endsWith('/analytics/summary')) {
        return Promise.resolve({ success: true, data: statsFixture });
      }

      if (url.endsWith('/analytics/events-timeline')) {
        return Promise.resolve({ success: true, data: { timeline: eventsTimelineFixture } });
      }

      if (url.endsWith('/analytics/event-types')) {
        return Promise.resolve({ success: true, data: { eventTypes: eventTypesFixture } });
      }

      if (url.endsWith('/enrollments')) {
        return Promise.resolve({ success: true, data: { enrollments: enrollmentsFixture } });
      }

      if (url.endsWith('/submissions')) {
        return Promise.resolve({ success: true, data: { submissions: submissionsFixture } });
      }

      return Promise.resolve({
        success: true,
        data: {
          ...taskFixture,
          environmentConfig: {
            copyPastePolicy: 'blocked',
            submission: {
              minCharacters: 100,
              maxCharacters: 500,
            },
          },
        },
      });
    });

    render(<TaskDetailPage />);

    const overviewRegion = (await screen.findByText('Task Overview')).closest('.rounded-lg');
    expect(overviewRegion).not.toBeNull();
    expect(within(overviewRegion as HTMLElement).getByText('Writing Session')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('No limit')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('Copy & Paste')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('Blocked')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('100-500 characters')).toBeInTheDocument();
  });

  it('does not show phantom AI model or request budget when task AI is disabled', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/v1/ai/settings') {
        return Promise.resolve({ success: true, data: mockAiSettings });
      }

      if (url.endsWith('/files')) {
        return Promise.resolve({ success: true, data: [] });
      }

      if (url.endsWith('/analytics/summary')) {
        return Promise.resolve({ success: true, data: statsFixture });
      }

      if (url.endsWith('/analytics/events-timeline')) {
        return Promise.resolve({ success: true, data: { timeline: eventsTimelineFixture } });
      }

      if (url.endsWith('/analytics/event-types')) {
        return Promise.resolve({ success: true, data: { eventTypes: eventTypesFixture } });
      }

      if (url.endsWith('/enrollments')) {
        return Promise.resolve({ success: true, data: { enrollments: enrollmentsFixture } });
      }

      if (url.endsWith('/submissions')) {
        return Promise.resolve({ success: true, data: { submissions: submissionsFixture } });
      }

      return Promise.resolve({
        success: true,
        data: {
          ...taskFixture,
          allowedLlmModels: ['deepseek-ai/DeepSeek-V3'],
          aiUsageLimit: 100,
          environmentConfig: {
            ...taskFixture.environmentConfig,
            aiAccess: 'off',
            aiProvider: undefined,
            allowedModels: [],
            customModels: [],
            traceability: {
              ...taskFixture.environmentConfig.traceability,
              trackAiUsage: false,
            },
          },
        },
      });
    });

    render(<TaskDetailPage />);

    const overviewRegion = (await screen.findByText('Task Overview')).closest('.rounded-lg');
    expect(overviewRegion).not.toBeNull();
    expect(within(overviewRegion as HTMLElement).getByText('AI Access')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('Disabled')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('AI is off for this task')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).getByText('AI disabled')).toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).queryByText('deepseek-ai/DeepSeek-V3')).not.toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).queryByText('moonshotai/Kimi-K2.6')).not.toBeInTheDocument();
    expect(within(overviewRegion as HTMLElement).queryByText('100 requests per user')).not.toBeInTheDocument();
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
    expect(within(latestTable).getByRole('columnheader', { name: 'Analytics' })).toBeInTheDocument();
    fireEvent.click(within(latestTable).getByRole('button', { name: /view analytics/i }));
    expect(mockPush).toHaveBeenCalledWith('/tasks/task-123/submissions/submission-latest?from=submission');

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
    expect(within(activeUserRow!).getByText(
      adminLocalTimeFormatter.format(new Date('2026-05-01T12:00:00.000Z'))
    )).toBeInTheDocument();
    expect(within(activeUserRow!).getByText(
      adminLocalTimeFormatter.format(new Date('2026-05-15T01:58:00.000Z'))
    )).toBeInTheDocument();
    expect(activeUserRow!).not.toHaveTextContent(/GMT|UTC/);

    fireEvent.click(activeUserRow!);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('updates the task tab query when a tab is selected', async () => {
    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

    expect(mockReplace).toHaveBeenCalledWith('/tasks/task-123?tab=analytics', { scroll: false });
  });

  it('opens the analytics tab with task-level metrics and submission analytics links', async () => {
    mockSearchParams = new URLSearchParams('tab=analytics');

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
    expect(screen.getByText('Submitted users')).toBeInTheDocument();
    expect(screen.getByText('Total submissions')).toBeInTheDocument();
    expect(screen.getByText('Avg editing time')).toBeInTheDocument();
    expect(screen.getByText('Completion Difficulty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completion Difficulty' })).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('43/100 · 50% completed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Submission Timeline' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Event Type Distribution' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Event Type Percentage' })).toBeInTheDocument();
    expect(screen.getByTestId('event-type-total-events')).toHaveTextContent('60events');
    expect(screen.queryByRole('heading', { name: 'Submissions' })).not.toBeInTheDocument();
    expect(screen.queryByText('Latest Essay')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view analytics/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/session/i)).not.toBeInTheDocument();
  });

  it('hides active task settings and falls direct setting URLs back to overview', async () => {
    mockSearchParams = new URLSearchParams('tab=setting');

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    expect(await screen.findByText('Task Overview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Setting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Task Settings' })).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/tasks/task-123', { scroll: false });
  });

  it('exports the current setting form state as environment config JSON', async () => {
    mockSearchParams = new URLSearchParams('tab=setting');
    mockTaskOverviewResponses({ ...taskFixture, isActive: false });

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    expect(await screen.findByRole('heading', { name: 'Task Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export config/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Task Details' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /allow guest submissions/i })).toBeChecked();
    expect(screen.getByRole('heading', { name: 'Environment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit environment/i })).toBeInTheDocument();
    expect(screen.getByText('Window on')).toBeInTheDocument();
    expect(screen.getByText('30 min')).toBeInTheDocument();
    expect(screen.queryByLabelText(/AI API Key/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Advanced AI Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Task Token' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Users see this in their own timezone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved as one absolute deadline/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-sticky-actions')).toHaveClass('sticky');
    expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();

    const dialog = await openEnvironmentDialog();
    expect(within(dialog).getByRole('heading', { name: 'AI' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Task Availability' })).toBeInTheDocument();
    expect(within(dialog).getByText(
      `Set the task availability window shown to enrolled users. Times are shown in your local timezone: ${localTimeZoneLabel}.`
    )).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Writing Session' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Writing Rules' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: /^AI$/i })).toHaveValue('full');
    expect(within(dialog).getByLabelText(/AI API Key/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: /Provider/i })).toHaveValue('https://api.together.xyz/v1');
    expect(within(dialog).getByRole('option', { name: 'Anthropic' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: 'Claude' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: /Model/i })).toHaveValue('moonshotai/Kimi-K2.6');
    expect(within(dialog).getByRole('option', { name: 'moonshotai/Kimi-K2.6' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: /^Time$/i })).toHaveValue('time_limited');
    expect(within(dialog).getByRole('option', { name: 'No limitations' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'Time limited' })).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/AI Usage Limit/i), {
      target: { value: '17' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Task End Date/i), {
      target: { value: '2026-05-20T09:30' },
    });
    expect(within(dialog).getByLabelText(/Time Limit \(minutes\)/i)).toHaveValue(30);
    fireEvent.change(within(dialog).getByLabelText(/Time Limit \(minutes\)/i), {
      target: { value: '45' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Blocked' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /apply/i }));

    expect(mockApiPut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /export config/i }));

    await waitFor(() => {
      expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
    });

    const [blob, filename] = mockDownloadBlob.mock.calls[0] as [Blob, string];
    const exportedConfig = JSON.parse(await readBlobAsText(blob));

    expect(filename).toBe('Clipboard_Task-environment-config.json');
    expect(exportedConfig).toEqual(expect.objectContaining({
      taskType: 'admin_assigned',
      aiAccess: 'full',
      allowedModels: ['moonshotai/Kimi-K2.6'],
      customModels: [],
      copyPastePolicy: 'blocked',
      aiUsageLimit: {
        mode: 'max_requests',
        maxRequests: 17,
      },
    }));
    expect(exportedConfig.time).toEqual(expect.objectContaining({
      startTime: taskFixture.environmentConfig.time.startTime,
      endTime: new Date(2026, 4, 20, 9, 30).toISOString(),
      timeLimitSeconds: 45 * 60,
      lateSubmission: 'not_allowed',
    }));
    expect(exportedConfig.traceability).toEqual(expect.objectContaining({
      trackAiUsage: true,
      trackCopyPaste: false,
    }));

    const serializedConfig = JSON.stringify(exportedConfig);
    expect(serializedConfig).not.toContain('taskToken');
    expect(serializedConfig).not.toContain('9b0f63d3');
    expect(serializedConfig).not.toContain('apiKey');
    expect(serializedConfig).not.toContain('sk-');
    expect(serializedConfig).not.toContain('task_instruction_pdf');
  });

  it('shows AI key settings when no saved key exists', async () => {
    mockSearchParams = new URLSearchParams('tab=setting');
    mockAiSettings = null;
    mockTaskOverviewResponses({ ...taskFixture, isActive: false });

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    const dialog = await openEnvironmentDialog();
    expect(within(dialog).getByLabelText(/AI API Key/i)).toBeInTheDocument();
  });

  it('keeps the task provider and model when saved user AI settings resolve later', async () => {
    mockSearchParams = new URLSearchParams('tab=setting');
    const aiSettings = createDeferred<{ success: boolean; data: any }>();
    const openRouterTask = {
      ...taskFixture,
      isActive: false,
      allowedLlmModels: ['qwen/qwen3.5-397b-a17b'],
      environmentConfig: {
        ...taskFixture.environmentConfig,
        aiProvider: {
          provider: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
        },
        allowedModels: ['qwen/qwen3.5-397b-a17b'],
      },
    };

    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/v1/ai/settings') {
        return aiSettings.promise;
      }

      if (url.endsWith('/files')) {
        return Promise.resolve({ success: true, data: [] });
      }

      if (url.endsWith('/analytics/summary')) {
        return Promise.resolve({ success: true, data: statsFixture });
      }

      if (url.endsWith('/analytics/events-timeline')) {
        return Promise.resolve({ success: true, data: { timeline: eventsTimelineFixture } });
      }

      if (url.endsWith('/analytics/event-types')) {
        return Promise.resolve({ success: true, data: { eventTypes: eventTypesFixture } });
      }

      if (url.endsWith('/enrollments')) {
        return Promise.resolve({ success: true, data: { enrollments: enrollmentsFixture } });
      }

      if (url.endsWith('/submissions')) {
        return Promise.resolve({ success: true, data: { submissions: submissionsFixture } });
      }

      return Promise.resolve({ success: true, data: openRouterTask });
    });

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    const dialog = await openEnvironmentDialog();
    expect(within(dialog).getByRole('combobox', { name: /Provider/i })).toHaveValue('https://openrouter.ai/api/v1');
    expect(within(dialog).getByRole('combobox', { name: /Model/i })).toHaveValue('qwen/qwen3.5-397b-a17b');

    await act(async () => {
      aiSettings.resolve({
        success: true,
        data: {
          hasApiKey: true,
          maskedApiKey: 'tgp_...abcd',
          baseUrl: 'https://api.together.xyz/v1',
        },
      });
      await aiSettings.promise;
    });

    await waitFor(() => {
      expect(within(dialog).getByLabelText(/AI API Key/i)).toHaveAttribute('placeholder', 'Current: tgp_...abcd');
    });
    expect(within(dialog).getByRole('combobox', { name: /Provider/i })).toHaveValue('https://openrouter.ai/api/v1');
    expect(within(dialog).getByRole('combobox', { name: /Model/i })).toHaveValue('qwen/qwen3.5-397b-a17b');
  });

  it('keeps AI connection details visible after a connection failure', async () => {
    mockSearchParams = new URLSearchParams('tab=setting');
    mockApiPost.mockRejectedValueOnce(new Error('Connection test failed.'));
    mockTaskOverviewResponses({ ...taskFixture, isActive: false });

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    const dialog = await openEnvironmentDialog();
    expect(within(dialog).getByLabelText(/AI API Key/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /test connection/i }));

    expect(await screen.findByText('Connection test failed.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/AI API Key/i)).toBeInTheDocument();
  });

  it('rejects changing task start date to the past in settings', async () => {
    mockSearchParams = new URLSearchParams('tab=setting');
    mockTaskOverviewResponses({ ...taskFixture, isActive: false });

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    const dialog = await openEnvironmentDialog();

    fireEvent.change(within(dialog).getByLabelText(/Task Start Date/i), {
      target: { value: '2000-01-01T09:30' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Task End Date/i), {
      target: { value: '2000-01-02T09:30' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /apply/i }));
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    const reopenedDialog = await screen.findByRole('dialog', { name: /edit environment/i });
    expect(within(reopenedDialog).getByText('Task start date cannot be in the past.')).toBeInTheDocument();
    expect(mockApiPut).not.toHaveBeenCalledWith('/api/v1/tasks/task-123', expect.anything());
  });

  it('saves grouped setting changes with the existing task payload shape', async () => {
    mockSearchParams = new URLSearchParams('tab=setting');
    mockTaskOverviewResponses({ ...taskFixture, isActive: false });

    render(<TaskDetailPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    const dialog = await openEnvironmentDialog();
    fireEvent.change(within(dialog).getByLabelText(/AI Usage Limit/i), {
      target: { value: '17' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Task End Date/i), {
      target: { value: '2026-05-20T09:30' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Time Limit \(minutes\)/i), {
      target: { value: '20' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Blocked' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /screen recording/i }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /camera recording/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /apply/i }));
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/v1/ai/settings/test', expect.objectContaining({
        apiKey: '__use_existing__',
      }));
      expect(mockApiPut).toHaveBeenCalledWith('/api/v1/tasks/task-123', expect.objectContaining({
        name: 'Clipboard Task',
        description: 'Task details',
        allowedLlmModels: ['moonshotai/Kimi-K2.6'],
        aiUsageLimit: 17,
      }));
    });

    const taskUpdateCall = mockApiPut.mock.calls.find(([url]) => url === '/api/v1/tasks/task-123');
    const payload = taskUpdateCall?.[1];
    expect(payload.environmentConfig).toEqual(expect.objectContaining({
      aiAccess: 'full',
      allowedModels: ['moonshotai/Kimi-K2.6'],
      copyPastePolicy: 'blocked',
      aiUsageLimit: {
        mode: 'max_requests',
        maxRequests: 17,
      },
    }));
    expect(payload.environmentConfig.time).toEqual(expect.objectContaining({
      startTime: taskFixture.environmentConfig.time.startTime,
      endTime: new Date(2026, 4, 20, 9, 30).toISOString(),
      timeLimitSeconds: 20 * 60,
      lateSubmission: 'not_allowed',
    }));
    expect(payload.environmentConfig.traceability).toEqual(expect.objectContaining({
      trackAiUsage: true,
      trackCopyPaste: false,
      requireScreenRecording: true,
      requireCameraRecording: true,
    }));
  });
});

describe('admin analytics date ranges', () => {
  it('uses task start through now for all time while the task is still active', () => {
    expect(getAnalyticsDateRange({
      preset: 'all',
      taskStartDate: '2026-05-01T12:00:00.000Z',
      taskEndDate: '2026-06-01T12:00:00.000Z',
      now: new Date('2026-05-20T16:00:00.000Z'),
    })).toEqual({
      startDate: '2026-05-01T12:00:00.000Z',
      endDate: '2026-05-20T16:00:00.000Z',
    });
  });

  it('uses task start through task end for all time after the task ends', () => {
    expect(getAnalyticsDateRange({
      preset: 'all',
      taskStartDate: '2026-05-01T12:00:00.000Z',
      taskEndDate: '2026-05-10T12:00:00.000Z',
      now: new Date('2026-05-20T16:00:00.000Z'),
    })).toEqual({
      startDate: '2026-05-01T12:00:00.000Z',
      endDate: '2026-05-10T12:00:00.000Z',
    });
  });
});
