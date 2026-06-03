import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RegisterPage from '@/app/(auth)/register/page';

const mockPush = jest.fn();
const mockRegister = jest.fn();
let mockIsLoading = false;

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector?: any) => {
    const state = {
      register: mockRegister,
      isLoading: mockIsLoading,
    };
    return selector ? selector(state) : state;
  },
}));

describe('admin register basic info flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoading = false;
    mockRegister.mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  it('collects first and last name during signup and registers an admin profile', async () => {
    const user = userEvent.setup();

    render(<RegisterPage />);

    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/john doe/i)).not.toBeInTheDocument();
    expect(screen.getByText(/create your account with the name shown/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/first name/i), 'Admin');
    await user.type(screen.getByLabelText(/last name/i), 'Owner');
    await user.type(screen.getByLabelText(/^email$/i), 'admin@example.com');
    await user.type(screen.getByPlaceholderText(/^enter your password$/i), 'Password123');
    await user.type(screen.getByPlaceholderText(/^confirm your password$/i), 'Password123');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        'admin@example.com',
        'Password123',
        'Admin',
        'Owner',
        'admin'
      );
    });
  });
});
