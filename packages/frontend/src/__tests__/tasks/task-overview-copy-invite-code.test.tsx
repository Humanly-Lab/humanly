import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import TaskOverviewPage from '@/app/tasks/[id]/page';

const mockPush = jest.fn();
const mockApiGet = jest.fn();
const mockClipboardWriteText = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({
    id: 'task-123',
  }),
  useRouter: () => ({
    push: mockPush,
  }),
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
  enrolledUserCount: 0,
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

function mockTaskOverviewResponses() {
  mockApiGet.mockImplementation((url: string) => {
    if (url.endsWith('/analytics/summary')) {
      return Promise.resolve({ success: true, data: statsFixture });
    }

    if (url.endsWith('/submissions')) {
      return Promise.resolve({ success: true, data: { submissions: [] } });
    }

    return Promise.resolve({ success: true, data: taskFixture });
  });
}

describe('admin task overview invite code copy button', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockApiGet.mockReset();
    mockClipboardWriteText.mockReset();
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

    render(<TaskOverviewPage />);

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

    render(<TaskOverviewPage />);

    await screen.findByRole('heading', { name: 'Clipboard Task' });
    fireEvent.click(screen.getByRole('button', { name: /copy invite code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy the invite code. Select the code and copy it manually.'
    );
    expect(screen.getByRole('heading', { name: 'Clipboard Task' })).toBeInTheDocument();

    warnSpy.mockRestore();
  });
});
