import { downloadBlobWithSavePicker } from '@/lib/download';

describe('downloadBlobWithSavePicker', () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  const originalShowSaveFilePicker = Object.getOwnPropertyDescriptor(window, 'showSaveFilePicker');

  beforeEach(() => {
    window.URL.createObjectURL = jest.fn(() => 'blob:certificate');
    window.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    document.body.innerHTML = '';

    if (originalShowSaveFilePicker) {
      Object.defineProperty(window, 'showSaveFilePicker', originalShowSaveFilePicker);
    } else {
      delete (window as any).showSaveFilePicker;
    }
  });

  const options = {
    filename: 'certificate-test.pdf',
    description: 'PDF certificate',
    mimeType: 'application/pdf',
    extensions: ['.pdf'],
  };

  it('uses the native save-file picker when available', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    const createWritable = jest.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = jest.fn().mockResolvedValue({ createWritable });
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
    expect(write).toHaveBeenCalledWith(blob);
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

    expect(loadBlob).toHaveBeenCalled();
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects empty downloads before saving a file', async () => {
    const showSaveFilePicker = jest.fn();
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: showSaveFilePicker,
    });

    await expect(downloadBlobWithSavePicker(
      () => Promise.resolve(new Blob([], { type: 'application/pdf' })),
      options
    )).rejects.toThrow('Downloaded file is empty');

    expect(showSaveFilePicker).not.toHaveBeenCalled();
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
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

  it('falls back to browser download when native save writing is denied', async () => {
    const createWritable = jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: jest.fn().mockResolvedValue({ createWritable }),
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await expect(downloadBlobWithSavePicker(
      () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
      options
    )).resolves.toBe('downloaded');

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });
});
