import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DocumentsPage from '@/app/documents/page';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiPut = jest.fn();
const mockDeleteDocument = jest.fn();

const createdDocument = {
  id: 'submission-doc-1',
  title: 'Enrollment Task Submission',
  content: {},
  plainText: '',
  status: 'draft',
  wordCount: 0,
  characterCount: 0,
  createdAt: '2026-05-14T12:00:00.000Z',
  updatedAt: '2026-05-14T12:00:00.000Z',
};

let documents = [] as any[];
let enrollments = [] as any[];

const mockCreateDocument = jest.fn(async (title: string) => {
  const document = { ...createdDocument, title };
  documents = [document];
  return document;
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: jest.fn(),
  },
}));

jest.mock('@/hooks/use-documents', () => ({
  useDocuments: () => ({
    documents,
    isLoading: false,
    error: null,
    createDocument: mockCreateDocument,
    deleteDocument: mockDeleteDocument,
  }),
}));

describe('task enrollment workflow', () => {
  let dateNowSpy: jest.SpyInstance<number, []> | null = null;

  beforeEach(() => {
    dateNowSpy?.mockRestore();
    dateNowSpy = null;
    documents = [];
    enrollments = [];
    mockPush.mockClear();
    mockToast.mockClear();
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiPut.mockReset();
    mockCreateDocument.mockClear();
    mockDeleteDocument.mockClear();

    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/tasks/my-enrollments') {
        return { data: { data: { enrollments } } };
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    mockApiPost.mockImplementation(async (path: string) => {
      if (path === '/tasks/join') {
        return {
          data: {
            data: {
              task: {
                id: 'task-1',
                name: 'Enrollment Task',
                description: 'Joinable task',
                inviteCode: 'ABC123',
                environmentConfig: { aiAccess: 'off' },
              },
            },
          },
        };
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    mockApiPut.mockImplementation(async (path: string) => {
      if (path === '/tasks/enrollments/task-1/submission-document') {
        enrollments = [{
          id: 'task-1',
          name: 'Enrollment Task',
          description: 'Joinable task',
          inviteCode: 'ABC123',
          documentId: 'submission-doc-1',
          joinedAt: '2026-05-14T12:00:00.000Z',
          environmentConfig: { aiAccess: 'off' },
        }];
        return { data: { success: true } };
      }
      throw new Error(`Unexpected PUT ${path}`);
    });
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
    dateNowSpy = null;
  });

  it('blocks invalid invite codes, enrolls valid codes, prevents duplicates, and opens submissions', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DocumentsPage />);

    expect(await screen.findByRole('heading', { name: /writing dashboard/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /task submissions/i }));

    await user.click(screen.getByRole('button', { name: /join task/i }));
    let dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/invite code/i), 'BAD');
    await user.click(within(dialog).getByRole('button', { name: /^join task$/i }));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Error',
      description: 'Invite code must be 6 letters or numbers',
      variant: 'destructive',
    }));
    expect(mockApiPost).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText(/invite code/i));
    await user.type(within(dialog).getByLabelText(/invite code/i), 'abc123');
    await user.click(within(dialog).getByRole('button', { name: /^join task$/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/tasks/join', { inviteCode: 'ABC123' });
      expect(mockCreateDocument).toHaveBeenCalledWith(
        'Enrollment Task Submission',
        undefined,
        { aiAccess: 'off' }
      );
      expect(mockApiPut).toHaveBeenCalledWith('/tasks/enrollments/task-1/submission-document', {
        documentId: 'submission-doc-1',
      });
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Task joined',
      }));
    });

    rerender(<DocumentsPage />);
    expect(await screen.findByRole('heading', { name: 'Task Submissions' })).toBeInTheDocument();
    expect(screen.getByText('Enrollment Task')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /join task/i }));
    dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/invite code/i), 'ABC123');
    await user.click(within(dialog).getByRole('button', { name: /^join task$/i }));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Already joined',
      description: 'This task is already on your dashboard',
    }));

    await user.click(screen.getByRole('button', { name: /open submission/i }));
    expect(mockPush).toHaveBeenCalledWith('/documents/submission-doc-1');
  });

  it('shows the persistent writing countdown on timed task cards', async () => {
    dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-05-14T12:01:30.000Z').getTime());
    documents = [{ ...createdDocument, id: 'timed-doc-1' }];
    enrollments = [{
      id: 'enroll-1',
      name: 'Timed Task',
      inviteCode: 'TIME01',
      documentId: 'timed-doc-1',
      joinedAt: '2026-05-14T12:00:00.000Z',
      writingStartedAt: '2026-05-14T12:00:00.000Z',
      environmentConfig: {
        time: {
          timeLimitSeconds: 120,
        },
      },
    }];

    const user = userEvent.setup();
    render(<DocumentsPage />);

    await screen.findByRole('heading', { name: /writing dashboard/i });
    await user.click(screen.getByRole('tab', { name: /task submissions/i }));

    expect(screen.getByText('Writing time left')).toBeInTheDocument();
    expect(screen.getByText('0:30')).toBeInTheDocument();
    expect(screen.getByText('Continues while you are away.')).toBeInTheDocument();
  });

  it('shows the persistent writing countdown on personal writing cards', async () => {
    dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-05-14T12:01:30.000Z').getTime());
    documents = [{
      ...createdDocument,
      id: 'personal-timed-doc-1',
      title: 'Timed Personal Writing',
      writingStartedAt: '2026-05-14T12:00:00.000Z',
      environmentConfig: {
        time: {
          timeLimitSeconds: 120,
        },
      },
    }];

    render(<DocumentsPage />);

    expect(await screen.findByRole('heading', { name: /writing dashboard/i })).toBeInTheDocument();
    expect(screen.getByText('Timed Personal Writing')).toBeInTheDocument();
    expect(screen.getByText('Writing time left')).toBeInTheDocument();
    expect(screen.getByText('0:30')).toBeInTheDocument();
    expect(screen.getByText('Continues while you are away.')).toBeInTheDocument();
  });

  it('marks expired timed personal writing cards as read-only while preserving access', async () => {
    dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-05-14T12:03:00.000Z').getTime());
    documents = [{
      ...createdDocument,
      id: 'personal-expired-doc-1',
      title: 'Expired Personal Writing',
      writingStartedAt: '2026-05-14T12:00:00.000Z',
      environmentConfig: {
        time: {
          timeLimitSeconds: 120,
        },
      },
    }];

    render(<DocumentsPage />);

    expect(await screen.findByRole('heading', { name: /writing dashboard/i })).toBeInTheDocument();
    expect(screen.getByText('Expired Personal Writing')).toBeInTheDocument();
    expect(screen.getByText('Writing time limit reached')).toBeInTheDocument();
    expect(screen.getByText('Opens in read-only mode.')).toBeInTheDocument();
    expect(screen.getByText('Open Read-only')).toBeInTheDocument();
  });

  it('marks expired timed task cards as read-only while preserving access', async () => {
    dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-05-14T12:03:00.000Z').getTime());
    documents = [{ ...createdDocument, id: 'expired-doc-1' }];
    enrollments = [{
      id: 'enroll-1',
      name: 'Expired Timed Task',
      inviteCode: 'TIME02',
      documentId: 'expired-doc-1',
      joinedAt: '2026-05-14T12:00:00.000Z',
      writingStartedAt: '2026-05-14T12:00:00.000Z',
      environmentConfig: {
        time: {
          timeLimitSeconds: 120,
        },
      },
    }];

    const user = userEvent.setup();
    render(<DocumentsPage />);

    await screen.findByRole('heading', { name: /writing dashboard/i });
    await user.click(screen.getByRole('tab', { name: /task submissions/i }));

    expect(screen.getByText('Writing time limit reached')).toBeInTheDocument();
    expect(screen.getByText('Submission opens in read-only mode.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open read-only/i }));
    expect(mockPush).toHaveBeenCalledWith('/documents/expired-doc-1');
  });
});
