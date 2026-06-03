import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RegisterPage from '@/app/(auth)/register/page';

const mockPush = jest.fn();
const mockRegister = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector?: any) => {
    const state = {
      register: mockRegister,
      isLoading: false,
    };
    return selector ? selector(state) : state;
  },
}));

describe('admin registration names', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('requires first and last name during admin signup', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockRegister.mockResolvedValueOnce(undefined);

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/first name/i), 'Admin');
    await user.type(screen.getByLabelText(/last name/i), 'Owner');
    await user.type(screen.getByLabelText(/^email$/i), 'admin@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'Password123!');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'Password123!');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        'admin@example.com',
        'Password123!',
        'Admin',
        'Owner',
        'admin'
      );
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockPush).toHaveBeenCalledWith('/verify-email?email=admin%40example.com');
  });
});
