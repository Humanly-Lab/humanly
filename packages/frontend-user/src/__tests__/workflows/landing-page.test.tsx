import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FastWritingDemoPage from '@/app/demo/fast-writing/page';
import HomePage from '@/app/page';

const mockReplace = jest.fn();
const mockCheckAuth = jest.fn();

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toString: jest.fn().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>'),
  },
}));

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

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: jest.fn(() => false),
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });
  });

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

  it('opens the fast writing demo in a separate tab instead of embedding it on the homepage', async () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: /Humanly Demo/i })).toBeInTheDocument();
    expect(screen.queryByText('Fast writing demo')).not.toBeInTheDocument();
    expect(screen.getByText(/Try the real flow in a separate demo workspace/i)).toBeInTheDocument();
    const launchVideo = screen.getByLabelText(/Humanly product video/i);
    expect(launchVideo).toHaveAttribute('controls');
    expect((launchVideo as HTMLVideoElement).muted).toBe(true);
    expect(launchVideo).toHaveAttribute('poster', '/videos/humanly-launch-poster.png');
    expect(launchVideo).toHaveAttribute('preload', 'metadata');
    expect(document.querySelector('video[aria-label="Humanly product video"] source')).toHaveAttribute(
      'src',
      '/videos/humanly-launch.mp4'
    );
    expect(screen.queryByRole('heading', { name: /New Task/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Task Configuration/i)).not.toBeInTheDocument();
    const faqSection = document.querySelector('#faq');
    const demoSection = document.querySelector('#demo');
    expect(faqSection).not.toBeNull();
    expect(demoSection).not.toBeNull();
    expect(faqSection?.compareDocumentPosition(demoSection as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(demoSection as HTMLElement).queryByText('Launch video')).not.toBeInTheDocument();
    expect(within(demoSection as HTMLElement).queryByText('1:36')).not.toBeInTheDocument();
    expect(within(demoSection as HTMLElement).queryByText('Configure')).not.toBeInTheDocument();
    expect(within(demoSection as HTMLElement).queryByText('Write')).not.toBeInTheDocument();
    expect(within(demoSection as HTMLElement).queryByText('Record')).not.toBeInTheDocument();
    expect(within(demoSection as HTMLElement).queryByText('Certify')).not.toBeInTheDocument();

    for (const link of screen.getAllByRole('link', { name: /Try the demo|Open Demo/i })) {
      expect(link).toHaveAttribute('href', '/demo/fast-writing');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }

    await waitFor(() => expect(mockCheckAuth).toHaveBeenCalled());
  });

  it('keeps the hero showcase on the selected mode until visitors switch it manually', () => {
    jest.useFakeTimers();

    try {
      render(<HomePage />);

      const videoToggle = screen.getByRole('button', { name: 'Show product video' });
      const workspaceToggle = screen.getByRole('button', { name: 'Show product workspace' });

      expect(videoToggle).toHaveAttribute('aria-pressed', 'true');
      expect(workspaceToggle).toHaveAttribute('aria-pressed', 'false');

      act(() => {
        jest.advanceTimersByTime(30000);
      });

      expect(videoToggle).toHaveAttribute('aria-pressed', 'true');
      expect(workspaceToggle).toHaveAttribute('aria-pressed', 'false');
    } finally {
      jest.useRealTimers();
    }
  });

  it('lets visitors run the standalone fast writing demo without auth', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn();
    const originalFetch = global.fetch;
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: fetchMock,
    });
    const storageSetItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    try {
      render(<FastWritingDemoPage />);

      expect(screen.getByText('Humanly Demo')).toBeInTheDocument();
      expect(screen.queryByText('Fast writing demo')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Setup, write, certify/i })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /Try the real writing-to-certificate flow/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Personal writing demo')).not.toBeInTheDocument();
      expect(screen.queryByText('Personal writing')).not.toBeInTheDocument();
      expect(screen.queryByText('Create Writing')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create Document/i })).toBeInTheDocument();
      expect(screen.getByText(/Document setup/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Document Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/PDF source file/i)).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /New Task/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/Task Configuration/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Allow guest submissions/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Writing Session Timer/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Edit Time Window/i)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: /^cancel$/i })).toHaveAttribute('href', '/');
      expect(screen.queryByRole('button', { name: '' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /open reflection-source\.pdf/i }));
      expect(screen.getByRole('status')).toHaveTextContent(/opened local reference preview/i);
      await user.click(screen.getByRole('combobox', { name: /^environment$/i }));
      await user.click(await screen.findByRole('option', { name: /default environment/i }));
      expect(screen.queryByRole('combobox', { name: /ai access/i })).not.toBeInTheDocument();
      expect(screen.getByText('Off')).toBeInTheDocument();
      await user.click(screen.getByRole('combobox', { name: /^environment$/i }));
      await user.click(await screen.findByRole('option', { name: /^custom$/i }));
      await user.click(screen.getByRole('combobox', { name: /ai access/i }));
      await user.click(await screen.findByRole('option', { name: /full/i }));
      expect(screen.getByLabelText(/ai guidelines/i)).toBeInTheDocument();

      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
      const openWindow = jest.fn();
      Object.defineProperty(window, 'open', {
        configurable: true,
        value: openWindow,
      });
      const createObjectURL = jest
        .fn()
        .mockReturnValueOnce('blob:demo-certificate-pdf');
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: createObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: jest.fn(),
      });

      await user.click(screen.getByRole('button', { name: /create document/i }));
      expect(screen.getByRole('button', { name: /back to setup/i })).toBeEnabled();
      expect(screen.getByText('reflection-source.pdf')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view log/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /^generate certificate$/i })).toBeEnabled();
      const editor = screen.getByRole('textbox', { name: /demo writing editor/i }) as HTMLTextAreaElement;
      await user.type(
        editor,
        'This draft records process evidence.'
      );
      editor.setSelectionRange(0, 10);
      fireEvent.select(editor);
      expect(screen.getByRole('toolbar', { name: /ai selection tools/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /fix grammar/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /improve writing/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /simplify/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /make formal/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^ask ai$/i })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /simplify/i }));
      expect(screen.getByRole('status')).toHaveTextContent(/simplify applied locally/i);
      await user.type(screen.getByRole('textbox', { name: /demo ai prompt/i }), 'How should I organize this?');
      await user.click(screen.getByRole('button', { name: /ask ai assistant/i }));
      expect(screen.getByRole('status')).toHaveTextContent(/allowed use/i);
      await user.click(screen.getByRole('button', { name: /view log/i }));

      expect(screen.getByRole('heading', { name: /activity logs/i })).toBeInTheDocument();
      expect(screen.getAllByText('ai')[0]).toBeInTheDocument();
      expect(screen.getAllByText('input')[0]).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^generate certificate$/i }));
      const certificateDialog = screen.getByRole('dialog');
      expect(within(certificateDialog).getByRole('heading', { name: /generate certificate/i })).toBeInTheDocument();
      await user.click(within(certificateDialog).getByRole('button', { name: /^generate certificate$/i }));

      expect(await screen.findByText(/Verifiable writing process snapshot/i)).toBeInTheDocument();
      expect(screen.getByText(/demo identifiers/i)).toBeInTheDocument();
      const qrCode = await screen.findByAltText(/demo certificate verification qr code/i);
      expect(qrCode).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));
      expect(screen.getByText(/demo\/fast-writing#demo-certificate-local/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /share link/i }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/demo/fast-writing#demo-certificate-local')));
      expect(screen.getByRole('status')).toHaveTextContent(/share link copied/i);

      await user.click(screen.getByRole('button', { name: /open pdf/i }));
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(openWindow).toHaveBeenCalledWith('blob:demo-certificate-pdf', '_blank', 'noopener,noreferrer');
      expect(screen.queryByRole('button', { name: /json data/i })).not.toBeInTheDocument();
      expect(createObjectURL).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: /end demo/i }));
      expect(screen.getByText(/local session has ended/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /do it again/i }));
      expect(screen.getByRole('button', { name: /create document/i })).toBeInTheDocument();
      expect(screen.queryByText('This draft records process evidence.')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(storageSetItemSpy).not.toHaveBeenCalled();
    } finally {
      storageSetItemSpy.mockRestore();
      if (originalFetch) {
        Object.defineProperty(global, 'fetch', {
          configurable: true,
          value: originalFetch,
        });
      } else {
        Reflect.deleteProperty(global, 'fetch');
      }
    }
  }, 15000);

  it('gates the local demo selection tools by AI access mode', async () => {
    const user = userEvent.setup();

    render(<FastWritingDemoPage />);

    await user.click(screen.getByRole('combobox', { name: /ai access/i }));
    await user.click(await screen.findByRole('option', { name: /only polish/i }));
    await user.click(screen.getByRole('button', { name: /create document/i }));

    let editor = screen.getByRole('textbox', { name: /demo writing editor/i }) as HTMLTextAreaElement;
    await user.type(editor, 'This sentence can be improved.');
    editor.setSelectionRange(0, 13);
    fireEvent.select(editor);
    expect(screen.getByRole('button', { name: /fix grammar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /improve writing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /simplify/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /make formal/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ask ai$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to setup/i }));
    await user.click(screen.getByRole('combobox', { name: /ai access/i }));
    await user.click(await screen.findByRole('option', { name: /only agent chat/i }));
    await user.click(screen.getByRole('button', { name: /create document/i }));

    editor = screen.getByRole('textbox', { name: /demo writing editor/i }) as HTMLTextAreaElement;
    await user.type(editor, 'Ask about this sentence.');
    editor.setSelectionRange(0, 9);
    fireEvent.select(editor);
    expect(screen.getByRole('button', { name: /^ask ai$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fix grammar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /improve writing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /simplify/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make formal/i })).not.toBeInTheDocument();
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
    expect(screen.queryByText('Your process,')).not.toBeInTheDocument();
    expect(screen.queryByText('signed and delivered.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open the editor/i })).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: /Start writing|Start/i })) {
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
