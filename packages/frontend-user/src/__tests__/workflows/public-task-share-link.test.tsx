import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PublicTaskDocumentStartPage from '@/app/tasks/public/[token]/page';
import { TokenManager } from '@/lib/api-client';

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockRouterReplace = jest.fn();
const mockCheckAuth = jest.fn();
let mockAuthUser: any = null;

jest.mock('next/navigation', () => ({
  useParams: () => ({
    token: 'share-token-123',
  }),
  useRouter: () => ({
    replace: (...args: any[]) => mockRouterReplace(...args),
  }),
}));

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
  },
  TokenManager: {
    getAccessToken: jest.fn(),
    setAccessToken: jest.fn(),
    setPublicDocumentAccessToken: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
    }
  },
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    () => ({
      checkAuth: mockCheckAuth,
    }),
    {
      getState: () => ({
        user: mockAuthUser,
      }),
    }
  ),
}));

describe('public task share link workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/tasks/public/share-token-123');
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockRouterReplace.mockReset();
    mockCheckAuth.mockReset();
    mockAuthUser = null;
    (TokenManager.getAccessToken as jest.Mock).mockReset();
    (TokenManager.setAccessToken as jest.Mock).mockReset();
    (TokenManager.setPublicDocumentAccessToken as jest.Mock).mockReset();
    (TokenManager.getAccessToken as jest.Mock).mockReturnValue(null);
    mockCheckAuth.mockResolvedValue(undefined);
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        task: {
          name: 'Public Reflection',
          description: 'Write a short reflection.',
          startDate: new Date(Date.now() - 60_000).toISOString(),
          endDate: new Date(Date.now() + 60_000).toISOString(),
          allowGuestSubmissions: true,
          availabilityStatus: 'open',
        },
      },
    });

    mockApiPost.mockResolvedValue({
      success: true,
      data: {
        accessToken: 'access-token-1',
        publicSessionId: 'browser-session-1',
        task: {
          id: 'task-1',
          name: 'Public Reflection',
        },
        document: {
          id: 'document-1',
          title: 'Public Reflection Submission',
        },
      },
    });
  });

  it('lets an unauthenticated visitor choose guest mode and redirects into the editor', async () => {
    render(<PublicTaskDocumentStartPage />);

    expect(await screen.findByRole('heading', { name: 'Public Reflection' })).toBeInTheDocument();
    expect(screen.getByText('Write a short reflection.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login?next=%2Ftasks%2Fpublic%2Fshare-token-123'
    );
    expect(screen.getByRole('link', { name: /create account/i })).toHaveAttribute(
      'href',
      '/register?next=%2Ftasks%2Fpublic%2Fshare-token-123'
    );

    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/tasks/public/share-token-123/start',
        { sessionId: expect.any(String), mode: 'guest' },
        { skipAuthRedirect: true }
      );
    });

    await waitFor(() => {
      expect(TokenManager.setPublicDocumentAccessToken).toHaveBeenCalledWith('document-1', 'access-token-1');
      expect(TokenManager.setAccessToken).toHaveBeenCalledWith('access-token-1');
      expect(mockRouterReplace).toHaveBeenCalledWith('/documents/document-1');
    });
  });

  it('lets a signed-in visitor choose signed-in mode without replacing their token', async () => {
    mockAuthUser = {
      id: 'user-1',
      email: 'writer@example.com',
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (TokenManager.getAccessToken as jest.Mock).mockReturnValue('signed-in-access-token');
    mockApiPost.mockResolvedValueOnce({
      success: true,
      data: {
        publicSessionId: 'browser-session-1',
        mode: 'signed-in',
        task: {
          id: 'task-1',
          name: 'Public Reflection',
        },
        document: {
          id: 'document-1',
          title: 'Public Reflection Submission',
        },
      },
    });

    render(<PublicTaskDocumentStartPage />);

    expect(await screen.findByRole('button', { name: /continue as writer@example\.com/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue as guest/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /continue as writer@example\.com/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/tasks/public/share-token-123/start',
        { sessionId: expect.any(String), mode: 'signed-in' },
        { skipAuthRedirect: true }
      );
      expect(TokenManager.setPublicDocumentAccessToken).not.toHaveBeenCalled();
      expect(TokenManager.setAccessToken).not.toHaveBeenCalled();
      expect(mockRouterReplace).toHaveBeenCalledWith('/documents/document-1');
    });
  });

  it('redirects unauthenticated visitors to login when guest submissions are disabled', async () => {
    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: {
        task: {
          name: 'Private Reflection',
          description: null,
          startDate: new Date(Date.now() - 60_000).toISOString(),
          endDate: new Date(Date.now() + 60_000).toISOString(),
          availabilityStatus: 'open',
          allowGuestSubmissions: false,
        },
      },
    });

    render(<PublicTaskDocumentStartPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/login?next=%2Ftasks%2Fpublic%2Fshare-token-123');
    });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('auto-starts signed-in mode when guest submissions are disabled and a user is authenticated', async () => {
    mockAuthUser = {
      id: 'user-1',
      email: 'writer@example.com',
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: {
        task: {
          name: 'Private Reflection',
          description: null,
          startDate: new Date(Date.now() - 60_000).toISOString(),
          endDate: new Date(Date.now() + 60_000).toISOString(),
          availabilityStatus: 'open',
          allowGuestSubmissions: false,
        },
      },
    });
    mockApiPost.mockResolvedValueOnce({
      success: true,
      data: {
        publicSessionId: 'browser-session-1',
        mode: 'signed-in',
        task: {
          id: 'task-1',
          name: 'Private Reflection',
        },
        document: {
          id: 'document-1',
          title: 'Private Reflection Submission',
        },
      },
    });

    render(<PublicTaskDocumentStartPage />);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/tasks/public/share-token-123/start',
        { sessionId: expect.any(String), mode: 'signed-in' },
        { skipAuthRedirect: true }
      );
    });
  });

  it('shows scheduled tasks without start actions', async () => {
    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: {
        task: {
          name: 'Scheduled Reflection',
          description: 'Come back later.',
          startDate: new Date(Date.now() + 60_000).toISOString(),
          endDate: new Date(Date.now() + 120_000).toISOString(),
          allowGuestSubmissions: true,
          availabilityStatus: 'scheduled',
        },
      },
    });

    render(<PublicTaskDocumentStartPage />);

    expect(await screen.findByRole('heading', { name: 'Scheduled Reflection' })).toBeInTheDocument();
    expect(screen.getByText('This task is not open for submissions yet.')).toBeInTheDocument();
    expect(screen.getByText('Come back later.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue as guest/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('shows ended tasks without start actions', async () => {
    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: {
        task: {
          name: 'Ended Reflection',
          description: null,
          startDate: new Date(Date.now() - 120_000).toISOString(),
          endDate: new Date(Date.now() - 60_000).toISOString(),
          allowGuestSubmissions: true,
          availabilityStatus: 'ended',
        },
      },
    });

    render(<PublicTaskDocumentStartPage />);

    expect(await screen.findByRole('heading', { name: 'Ended Reflection' })).toBeInTheDocument();
    expect(screen.getByText('The submission deadline has passed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue as guest/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
