import { downloadBlobWithSavePicker, openDownloadUrl, openUrlInNewTab } from '@/lib/download';

describe('downloadBlobWithSavePicker', () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;

  beforeEach(() => {
    window.URL.createObjectURL = jest.fn(() => 'blob:certificate');
    window.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    document.body.innerHTML = '';
  });

  const options = {
    filename: 'certificate-test.pdf',
    description: 'PDF certificate',
    mimeType: 'application/pdf',
    extensions: ['.pdf'],
  };

  it('uses the native save-file picker when available', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const truncate = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    const createWritable = jest.fn().mockResolvedValue({ write, truncate, close });
    const getFile = jest.fn().mockResolvedValue(new File(['pdf'], 'certificate-test.pdf', { type: 'application/pdf' }));
    const showSaveFilePicker = jest.fn().mockResolvedValue({ createWritable, getFile });
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: showSaveFilePicker,
    });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click');
    const blob = new Blob(['pdf'], { type: 'application/pdf' });

    await expect(downloadBlobWithSavePicker(() => Promise.resolve(blob), options)).resolves.toBe('saved');

    expect(showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'certificate-test.pdf',
      types: [{
        description: 'PDF certificate',
        accept: { 'application/pdf': ['.pdf'] },
      }],
    });
    expect(write).toHaveBeenCalledWith(new Uint8Array([112, 100, 102]));
    expect(truncate).toHaveBeenCalledWith(3);
    expect(close).toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('does not download when the user cancels the picker', async () => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: jest.fn().mockRejectedValue(new DOMException('canceled', 'AbortError')),
    });
    const loadBlob = jest.fn().mockResolvedValue(new Blob(['pdf']));

    await expect(downloadBlobWithSavePicker(loadBlob, options)).resolves.toBe('canceled');

    expect(loadBlob).not.toHaveBeenCalled();
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects empty downloads before opening a writable file', async () => {
    const createWritable = jest.fn();
    const showSaveFilePicker = jest.fn();
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: showSaveFilePicker.mockResolvedValue({ createWritable }),
    });

    await expect(downloadBlobWithSavePicker(
      () => Promise.resolve(new Blob([], { type: 'application/pdf' })),
      options
    )).rejects.toThrow('Downloaded file is empty');

    expect(showSaveFilePicker).toHaveBeenCalled();
    expect(createWritable).not.toHaveBeenCalled();
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects when the saved file size does not match the downloaded bytes', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    const createWritable = jest.fn().mockResolvedValue({ write, close });
    const getFile = jest.fn().mockResolvedValue(new File([], 'certificate-test.pdf', { type: 'application/pdf' }));
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: jest.fn().mockResolvedValue({ createWritable, getFile }),
    });

    await expect(downloadBlobWithSavePicker(
      () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
      options
    )).rejects.toThrow('Downloaded file size mismatch');
  });

  it('falls back to browser download when the save picker is unavailable', async () => {
    delete (window as any).showSaveFilePicker;
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await expect(downloadBlobWithSavePicker(
      () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
      options
    )).resolves.toBe('downloaded');

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  it('starts direct download URLs in the current tab', () => {
    const originalLocation = window.location;
    const hrefSetter = jest.fn();
    delete (window as any).location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '', set assignHref(value: string) { hrefSetter(value); } },
    });
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      set: hrefSetter,
      get: () => '',
    });

    expect(openDownloadUrl('http://localhost:3001/api/v1/certificates/cert-1/pdf')).toBe('downloaded');

    expect(hrefSetter).toHaveBeenCalledWith('http://localhost:3001/api/v1/certificates/cert-1/pdf');

    delete (window as any).location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('opens preview URLs in a new tab', () => {
    const openedWindow = { opener: window } as unknown as Window;
    const open = jest.spyOn(window, 'open').mockReturnValue(openedWindow);

    expect(openUrlInNewTab('http://localhost:3001/api/v1/certificates/cert-1/pdf?disposition=inline')).toBe('downloaded');

    expect(open).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/certificates/cert-1/pdf?disposition=inline',
      '_blank'
    );
    expect(openedWindow.opener).toBeNull();
  });

  it('falls back to a target-blank link when window.open is blocked', () => {
    jest.spyOn(window, 'open').mockReturnValue(null);
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    expect(openUrlInNewTab('http://localhost:3001/api/v1/certificates/cert-1/pdf?disposition=inline')).toBe('downloaded');

    const link = document.querySelector('a');
    expect(click).toHaveBeenCalled();
    expect(link).toBeNull();
  });

});
