import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import TasksPage from '@/app/tasks/page';

const mockPush = jest.fn();
const mockApiGet = jest.fn();
const mockApiDelete = jest.fn();
const mockApiPut = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
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

const makeTaskFixture = (overrides: Partial<typeof taskFixture> = {}) => ({
  ...taskFixture,
  ...overrides,
});

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
    mockApiPut.mockReset();
    mockApiDelete.mockReset();
    mockApiGet.mockResolvedValue({
      success: true,
      data: [taskFixture],
    });
    mockApiPut.mockResolvedValue({
      success: true,
      data: { ...taskFixture, isActive: false },
      message: 'Task updated successfully',
    });
    mockApiDelete.mockResolvedValue({ success: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
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
    expect(screen.getByText('Open now')).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('menuitem', { name: /archive task/i }));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/api/v1/tasks/task-123', { isActive: false });
    });

    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining('Invite codes and public share links will stop working'));

    fireEvent.click(screen.getByRole('tab', { name: /archived/i }));
    expect(await screen.findByRole('heading', { name: 'Humanly Draft' })).toBeInTheDocument();

    openOptionsMenu();
    mockApiPut.mockResolvedValueOnce({
      success: true,
      data: { ...taskFixture, isActive: true },
      message: 'Task updated successfully',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: /restore task/i }));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenLastCalledWith('/api/v1/tasks/task-123', { isActive: true });
    });
  });

  it('separates open and archived tasks and searches only the active tab', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: [
        makeTaskFixture({
          id: 'scheduled-task',
          name: 'Scheduled Essay',
          startDate: '2099-01-01T00:00:00.000Z',
          endDate: '2099-01-15T00:00:00.000Z',
          submissionCount: 0,
        }),
        makeTaskFixture({
          id: 'ended-task',
          name: 'Ended Essay',
          startDate: '2000-01-01T00:00:00.000Z',
          endDate: '2000-01-15T00:00:00.000Z',
          submissionCount: 1,
        }),
        makeTaskFixture({
          id: 'archived-task',
          name: 'Archived Essay',
          description: 'Stored for later.',
          isActive: false,
          submissionCount: 3,
        }),
      ],
    });

    render(<TasksPage />);

    expect(await screen.findByRole('heading', { name: 'Scheduled Essay' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ended Essay' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Archived Essay' })).not.toBeInTheDocument();
    expect(screen.getByText('2 open tasks')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search tasks...'), {
      target: { value: 'Archived' },
    });

    expect(screen.getByText('No open tasks match your search query Archived')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /archived/i }));

    expect(await screen.findByRole('heading', { name: 'Archived Essay' })).toBeInTheDocument();
    expect(screen.getByText('1 archived task found')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search tasks...'), {
      target: { value: '' },
    });

    expect(screen.getByText('1 archived task')).toBeInTheDocument();
  });

  it('keeps delete behavior on the active tab', async () => {
    render(<TasksPage />);

    await screen.findByRole('heading', { name: 'Humanly Draft' });

    openOptionsMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledWith('/api/v1/tasks/task-123');
    });
  });

  it('refreshes task window badges while the dashboard stays open', async () => {
    jest.useFakeTimers({
      now: new Date('2026-05-15T23:52:50.000Z'),
    });
    mockApiGet.mockResolvedValue({
      success: true,
      data: [
        makeTaskFixture({
          startDate: '2026-05-15T23:53:00.000Z',
          endDate: '2026-05-16T23:53:00.000Z',
        }),
      ],
    });

    render(<TasksPage />);

    expect(await screen.findByText('Scheduled')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(15_000);
    });

    expect(await screen.findByText('Open now')).toBeInTheDocument();
  });
});
