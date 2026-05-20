import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import TasksPage from '@/app/tasks/page';

const mockPush = jest.fn();
const mockApiGet = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
}));

const taskFixture = {
  id: 'task-123',
  userId: 'admin-123',
  name: 'Humanly Draft',
  description: 'A concise writing assignment.',
  taskToken: 'd5d79100-0000-4000-9000-000000000000',
  userIdKey: 'email',
  externalServiceType: null,
  externalServiceUrl: null,
  allowedLlmModels: ['gpt-4o-mini'],
  aiUsageLimit: 100,
  startDate: '2026-05-15T23:53:00.000Z',
  endDate: '2126-05-15T23:53:00.000Z',
  environmentConfig: null,
  isActive: true,
  enrolledUserCount: 1,
  documentCount: 1,
  eventCount: 0,
  submissionCount: 2,
  createdAt: '2026-05-15T23:53:00.000Z',
  updatedAt: '2026-05-15T23:53:00.000Z',
};

const adminLocalDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

describe('admin task list card actions', () => {
  const openOptionsMenu = () => {
    fireEvent.click(screen.getByRole('button', { name: /options/i }), { detail: 1 });
  };

  beforeEach(() => {
    mockPush.mockClear();
    mockApiGet.mockReset();
    mockApiDelete.mockReset();
    mockApiGet.mockResolvedValue({
      success: true,
      data: [taskFixture],
    });
    mockApiDelete.mockResolvedValue({ success: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a simplified card and routes through view and options actions', async () => {
    render(<TasksPage />);

    const taskHeading = await screen.findByRole('heading', { name: 'Humanly Draft' });
    expect(taskHeading).toBeInTheDocument();
    expect(taskHeading).toHaveAttribute('title', 'Humanly Draft');
    expect(taskHeading).toHaveClass('line-clamp-2');
    expect(taskHeading).toHaveClass('break-words');
    expect(screen.getByText('A concise writing assignment.')).toBeInTheDocument();
    expect(screen.getByText('2 completions')).toBeInTheDocument();
    const createdText = `Created ${adminLocalDateTimeFormatter.format(new Date(taskFixture.createdAt))}`;
    expect(screen.getByText(createdText)).toBeInTheDocument();
    expect(screen.getByText(createdText)).not.toHaveTextContent(/GMT|UTC/);
    expect(screen.queryByText('D5D791')).not.toBeInTheDocument();
    expect(screen.queryByText('100 AI limit')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-4o-mini')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^view$/i }));
    expect(mockPush).toHaveBeenLastCalledWith('/tasks/task-123');

    fireEvent.mouseEnter(screen.getByRole('button', { name: /options/i }));
    expect(screen.queryByRole('menuitem', { name: /view details/i })).not.toBeInTheDocument();

    openOptionsMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /view details/i }));
    expect(mockPush).toHaveBeenLastCalledWith('/tasks/task-123');

    openOptionsMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /edit setting/i }));
    expect(mockPush).toHaveBeenLastCalledWith('/tasks/task-123?tab=setting');

    openOptionsMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith('/api/v1/tasks/task-123');
    });
  });
});
