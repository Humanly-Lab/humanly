import { fireEvent, render, screen } from '@testing-library/react';

import { Navbar } from '@/components/navigation/navbar';

const mockPush = jest.fn();
const mockLogout = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    user: {
      email: 'admin@mail.com',
    },
    logout: mockLogout,
  }),
}));

describe('admin navbar', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLogout.mockClear();
  });

  it('uses the brand as the only tasks link in the top bar', () => {
    render(<Navbar />);

    const brandLink = screen.getByRole('link', { name: /humanly admin/i });
    expect(brandLink).toHaveAttribute('href', '/tasks');
    expect(brandLink.querySelector('img[src="/brand/pencil-angled.png"]')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^tasks$/i })).not.toBeInTheDocument();
  });

  it('keeps the mobile account menu without the redundant tasks link', () => {
    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getAllByText('admin@mail.com')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /^tasks$/i })).not.toBeInTheDocument();
  });
});
