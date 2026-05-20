import { render, screen, waitFor } from '@testing-library/react';

import PublicTaskDocumentStartPage from '@/app/tasks/public/[token]/page';
import { TokenManager } from '@/lib/api-client';

const mockApiPost = jest.fn();
const mockRouterReplace = jest.fn();

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
    post: (...args: any[]) => mockApiPost(...args),
  },
  TokenManager: {
    setAccessToken: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
    }
  },
}));

describe('public task share link workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiPost.mockReset();
    mockRouterReplace.mockReset();
    (TokenManager.setAccessToken as jest.Mock).mockReset();

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

  it('starts a public task document and redirects into the normal editor', async () => {
    render(<PublicTaskDocumentStartPage />);

    expect(screen.getByRole('heading', { name: 'Opening Humanly document' })).toBeInTheDocument();
    expect(screen.getByText('Preparing your writing space...')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/tasks/public/share-token-123/start',
        { sessionId: expect.any(String) },
        { skipAuthRedirect: true }
      );
    });

    await waitFor(() => {
      expect(TokenManager.setAccessToken).toHaveBeenCalledWith('access-token-1');
      expect(mockRouterReplace).toHaveBeenCalledWith('/documents/document-1');
    });
  });
});
