import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  const originalMarketingOrigin = process.env.NEXT_PUBLIC_MARKETING_ORIGIN;
  const originalProductAppOrigin = process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN;

  const restoreOrigins = () => {
    if (originalMarketingOrigin === undefined) {
      delete process.env.NEXT_PUBLIC_MARKETING_ORIGIN;
    } else {
      process.env.NEXT_PUBLIC_MARKETING_ORIGIN = originalMarketingOrigin;
    }

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
    restoreOrigins();
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

  it('lets visitors run the fast writing demo without auth', async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    expect(screen.getByRole('heading', { name: /Try the provenance loop/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start demo/i }));
    await user.type(
      screen.getByRole('textbox', { name: /demo writing editor/i }),
      'This draft records process evidence.'
    );
    await user.click(screen.getByRole('button', { name: /view log/i }));

    expect(screen.getByRole('heading', { name: /demo event log/i })).toBeInTheDocument();
    expect(screen.getAllByText('input')[0]).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^generate certificate$/i }));

    expect(screen.getByText('Demo certificate')).toBeInTheDocument();
    expect(screen.getByText(/local preview/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /end demo/i }));
    expect(screen.getByText(/local session has ended/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /do it again/i }));
    expect(screen.getByRole('button', { name: /start demo/i })).toBeInTheDocument();
    await waitFor(() => expect(mockCheckAuth).toHaveBeenCalled());
  });

  it('sends marketing-page auth actions to the configured product app origin', async () => {
    process.env.NEXT_PUBLIC_MARKETING_ORIGIN = 'https://writehumanly.net';
    process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN = 'https://app.writehumanly.net';

    render(<HomePage />);

    expect(screen.getAllByRole('link', { name: 'Humanly' })[0]).toHaveAttribute(
      'href',
      'https://writehumanly.net/'
    );
    const loginLink = screen.getByRole('link', { name: 'Log in' });
    expect(loginLink).toHaveAttribute(
      'href',
      'https://app.writehumanly.net/login'
    );
    expect(loginLink).not.toHaveClass('hidden');
    for (const link of screen.getAllByRole('link', { name: /Start writing|Start|Open the editor/i })) {
      expect(link).toHaveAttribute('href', 'https://app.writehumanly.net/register');
    }
    await waitFor(() => expect(mockCheckAuth).toHaveBeenCalled());
  });

  it('keeps the mobile footer aligned with the wordmark on the left and legal links on the right', async () => {
    render(<HomePage />);

    const footer = screen.getByRole('contentinfo');
    expect(footer.firstElementChild).toHaveClass('items-center');
    expect(footer.firstElementChild).toHaveClass('justify-between');
    expect(screen.getByRole('link', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms' })).toBeInTheDocument();
    await waitFor(() => expect(mockCheckAuth).toHaveBeenCalled());
  });
});
