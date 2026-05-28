import { render, screen, waitFor } from '@testing-library/react';

import HomePage from '@/app/page';

const mockReplace = jest.fn();
const mockCheckAuth = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('@/stores/auth-store', () => {
  const useAuthStore = () => ({
    checkAuth: mockCheckAuth,
    isAuthenticated: false,
  });
  useAuthStore.getState = () => ({
    checkAuth: mockCheckAuth,
    isAuthenticated: false,
  });

  return { useAuthStore };
});

describe('landing page', () => {
  const originalProductAppOrigin = process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN;

  const restoreProductAppOrigin = () => {
    if (originalProductAppOrigin === undefined) {
      delete process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN;
    } else {
      process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN = originalProductAppOrigin;
    }
  };

  beforeEach(() => {
    mockReplace.mockClear();
    mockCheckAuth.mockReset();
    mockCheckAuth.mockResolvedValue(undefined);
    restoreProductAppOrigin();
  });

  it('presents the approved human-AI collaboration and authorship proof copy', async () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: /Write with AI/i })).toBeInTheDocument();
    expect(screen.getByText('Write with AI.', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(
      'A writing workspace that quietly records how a draft came together, then signs it with a certificate any reader can verify.'
    )).toBeInTheDocument();
    expect(screen.queryByText('Human-AI collaboration')).not.toBeInTheDocument();
    expect(screen.queryByText('Tracked writing process')).not.toBeInTheDocument();
    expect(screen.queryByText('Verifiable certificates')).not.toBeInTheDocument();
    await waitFor(() => expect(mockCheckAuth).toHaveBeenCalled());
  });

  it('explains the trust model and use cases', async () => {
    render(<HomePage />);

    expect(screen.getByText('Process beats')).toBeInTheDocument();
    expect(screen.getByText('prediction.')).toBeInTheDocument();
    expect(screen.getByText('For writers')).toBeInTheDocument();
    expect(screen.getByText('For instructors')).toBeInTheDocument();
    expect(screen.queryByText('What it proves,')).not.toBeInTheDocument();
    expect(screen.queryByText('It does not claim')).not.toBeInTheDocument();
    await waitFor(() => expect(mockCheckAuth).toHaveBeenCalled());
  });

  it('sends marketing-page auth actions to the configured product app origin', async () => {
    process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN = 'https://app.writehumanly.net';

    render(<HomePage />);

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      'https://app.writehumanly.net/login'
    );
    for (const link of screen.getAllByRole('link', { name: /Start writing|Start|Open the editor/i })) {
      expect(link).toHaveAttribute('href', 'https://app.writehumanly.net/register');
    }
    await waitFor(() => expect(mockCheckAuth).toHaveBeenCalled());
  });
});
