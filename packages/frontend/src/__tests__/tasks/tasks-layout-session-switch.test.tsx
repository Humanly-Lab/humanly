import { render, screen, waitFor } from '@testing-library/react';

import TasksLayout from '@/app/tasks/layout';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockFetchUser = jest.fn();
let mockAuthState = {
  isAuthenticated: true,
  isLoading: false,
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

describe('tasks layout portal session switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchUser.mockResolvedValue(undefined);
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
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
  });
});
