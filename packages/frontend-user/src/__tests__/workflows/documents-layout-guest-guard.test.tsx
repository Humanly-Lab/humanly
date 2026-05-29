import { render, screen, waitFor } from '@testing-library/react';

import DocumentsLayout from '@/app/documents/layout';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCheckAuth = jest.fn();
const mockClearLocalSession = jest.fn();
let mockPathname = '/documents';
let mockAuthState = {
  user: {
    id: 'user-1',
    email: 'writer@example.com',
  },
  isAuthenticated: true,
  isLoading: false,
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => mockPathname,
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    ...mockAuthState,
    checkAuth: mockCheckAuth,
    clearLocalSession: mockClearLocalSession,
  }),
}));

jest.mock('@/components/navigation/navbar', () => ({
  Navbar: () => <nav>Navbar</nav>,
}));

describe('documents layout guest workspace guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAuth.mockResolvedValue(undefined);
    mockPathname = '/documents';
    window.history.pushState({}, '', '/documents');
    mockAuthState = {
      user: {
        id: 'user-1',
        email: 'writer@example.com',
      },
      isAuthenticated: true,
      isLoading: false,
    };
  });

  it('forces cookie session restore and removes the switch marker on portal switch', async () => {
    window.history.pushState({}, '', '/documents?switchSession=1');

    render(
      <DocumentsLayout>
        <main>Documents workspace</main>
      </DocumentsLayout>
    );

    await waitFor(() => expect(mockCheckAuth).toHaveBeenCalledWith({ forceRefresh: true }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/documents'));
    expect(await screen.findByText('Documents workspace')).toBeInTheDocument();
  });

  it('clears guest auth and redirects when a public task guest opens documents root', async () => {
    mockAuthState.user.email = 'public-task-guest@guest.humanly.local';

    render(
      <DocumentsLayout>
        <main>Documents workspace</main>
      </DocumentsLayout>
    );

    await waitFor(() => expect(mockCheckAuth).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClearLocalSession).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Documents workspace')).not.toBeInTheDocument();
  });

  it('clears guest auth and redirects when a public task guest opens new document', async () => {
    mockPathname = '/documents/new';
    mockAuthState.user.email = 'public-task-guest@guest.humanly.local';

    render(
      <DocumentsLayout>
        <main>New document</main>
      </DocumentsLayout>
    );

    await waitFor(() => expect(mockClearLocalSession).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('New document')).not.toBeInTheDocument();
  });

  it('allows a public task guest to open their task document route', async () => {
    mockPathname = '/documents/doc-1';
    mockAuthState.user.email = 'public-task-guest@guest.humanly.local';

    render(
      <DocumentsLayout>
        <main>Task document</main>
      </DocumentsLayout>
    );

    expect(await screen.findByText('Task document')).toBeInTheDocument();
    expect(mockClearLocalSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps normal users in the documents workspace', async () => {
    render(
      <DocumentsLayout>
        <main>Documents workspace</main>
      </DocumentsLayout>
    );

    expect(await screen.findByText('Documents workspace')).toBeInTheDocument();
    expect(mockClearLocalSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
