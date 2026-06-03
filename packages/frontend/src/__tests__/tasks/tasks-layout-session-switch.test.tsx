import { render, screen, waitFor } from '@testing-library/react';

import TasksLayout from '@/app/tasks/layout';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockFetchUser = jest.fn();
let mockAuthState: {
  isAuthenticated: boolean;
  isLoading: boolean;
  user?: {
    email: string;
    profileCompleted?: boolean;
  } | null;
} = {
  isAuthenticated: true,
  isLoading: false,
  user: {
    email: 'admin@mail.com',
    profileCompleted: true,
  },
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    ...mockAuthState,
    fetchUser: mockFetchUser,
  }),
}));

jest.mock('@/components/navigation/navbar', () => ({
  Navbar: () => <nav>Navbar</nav>,
}));

jest.mock('@/components/account/basic-info-dialog', () => ({
  BasicInfoDialog: ({ open, mode }: { open: boolean; mode: string }) =>
    open ? <section data-testid="basic-info-dialog">{mode}</section> : null,
}));

describe('tasks layout portal session switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchUser.mockResolvedValue(undefined);
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: {
        email: 'admin@mail.com',
        profileCompleted: true,
      },
    };
    window.history.pushState({}, '', '/tasks');
  });

  it('forces shared-cookie session restore and removes the switch marker', async () => {
    window.history.pushState({}, '', '/tasks?switchSession=1');

    render(
      <TasksLayout>
        <main>Admin tasks</main>
      </TasksLayout>
    );

    await waitFor(() => expect(mockFetchUser).toHaveBeenCalledWith({ forceRefresh: true }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/tasks'));
    expect(await screen.findByText('Admin tasks')).toBeInTheDocument();
  });

  it('keeps normal protected page validation unchanged', async () => {
    render(
      <TasksLayout>
        <main>Admin tasks</main>
      </TasksLayout>
    );

    await waitFor(() => expect(mockFetchUser).toHaveBeenCalledWith({ forceRefresh: false }));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(await screen.findByText('Admin tasks')).toBeInTheDocument();
    expect(screen.queryByTestId('basic-info-dialog')).not.toBeInTheDocument();
  });

  it('requires first-dashboard basic info when the admin profile is incomplete', async () => {
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: {
        email: 'admin@mail.com',
        profileCompleted: false,
      },
    };

    render(
      <TasksLayout>
        <main>Admin tasks</main>
      </TasksLayout>
    );

    await waitFor(() => expect(mockFetchUser).toHaveBeenCalledWith({ forceRefresh: false }));
    expect(await screen.findByText('Admin tasks')).toBeInTheDocument();
    expect(await screen.findByTestId('basic-info-dialog')).toHaveTextContent('complete');
  });
});
