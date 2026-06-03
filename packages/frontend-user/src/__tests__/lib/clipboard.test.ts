import { copyTextToClipboard } from '@/lib/clipboard';

describe('copyTextToClipboard', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    jest.restoreAllMocks();

    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      });
    }

    document.execCommand = originalExecCommand;
    document.body.innerHTML = '';
  });

  it('uses the Clipboard API when permission is available', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const execCommand = jest.fn();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = execCommand;

    await expect(copyTextToClipboard('token-123')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('token-123');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('falls back to textarea copy when Clipboard API permission is denied', async () => {
    const writeText = jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const execCommand = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = execCommand;

    await expect(copyTextToClipboard('token-123')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('token-123');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('returns false instead of throwing when all copy methods fail', async () => {
    const writeText = jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const execCommand = jest.fn(() => {
      throw new Error('copy blocked');
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = execCommand;

    await expect(copyTextToClipboard('token-123')).resolves.toBe(false);
  });
});
