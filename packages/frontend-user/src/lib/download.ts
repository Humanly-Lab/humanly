export type DownloadOutcome = 'saved' | 'downloaded' | 'canceled';

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

interface FileWritableStream {
  write: (data: Uint8Array | { type: 'write'; position: number; data: Uint8Array }) => Promise<void>;
  truncate?: (size: number) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSaveHandle {
  createWritable: () => Promise<FileWritableStream>;
  getFile?: () => Promise<File>;
}

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSaveHandle>;
};

function assertNonEmptyBlob(blob: Blob, filename: string) {
  if (blob.size <= 0) {
    throw new Error(`Downloaded file is empty: ${filename}`);
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
        return;
      }
      reject(new Error('Unable to read downloaded file data'));
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read downloaded file data'));
    reader.readAsArrayBuffer(blob);
  });
}

async function requestSaveFileHandle(options: {
  filename: string;
  description: string;
  mimeType: string;
  extensions: string[];
}): Promise<FileSaveHandle | 'canceled' | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const saveFilePicker = (window as WindowWithSavePicker).showSaveFilePicker;
  if (!saveFilePicker) {
    return null;
  }

  try {
    return await saveFilePicker.call(window, {
      suggestedName: options.filename,
      types: [{
        description: options.description,
        accept: {
          [options.mimeType]: options.extensions,
        },
      }],
    });
  } catch (error) {
    if (isAbortError(error)) {
      return 'canceled';
    }

    return null;
  }
}

export function downloadBlob(blob: Blob, filename: string): DownloadOutcome {
  assertNonEmptyBlob(blob, filename);

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 60_000);

  return 'downloaded';
}

export function openDownloadUrl(url: string): DownloadOutcome {
  window.location.href = url;
  return 'downloaded';
}

export function openUrlInNewTab(url: string): DownloadOutcome {
  const openedWindow = window.open(url, '_blank');
  if (openedWindow) {
    openedWindow.opener = null;
    return 'downloaded';
  }

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  return 'downloaded';
}

export async function downloadBlobWithSavePicker(
  loadBlob: () => Promise<Blob>,
  options: {
    filename: string;
    description: string;
    mimeType: string;
    extensions: string[];
  }
): Promise<DownloadOutcome> {
  const saveHandle = await requestSaveFileHandle(options);
  if (saveHandle === 'canceled') {
    return 'canceled';
  }

  const blob = await loadBlob();
  assertNonEmptyBlob(blob, options.filename);

  if (saveHandle) {
    const bytes = await blobToBytes(blob);
    const writable = await saveHandle.createWritable();

    await writable.write(bytes);
    if (writable.truncate) {
      await writable.truncate(bytes.byteLength);
    }
    await writable.close();

    if (saveHandle.getFile) {
      const savedFile = await saveHandle.getFile();
      if (savedFile.size !== bytes.byteLength) {
        throw new Error(`Downloaded file size mismatch: expected ${bytes.byteLength} bytes, saved ${savedFile.size} bytes`);
      }
    }

    return 'saved';
  }

  return downloadBlob(blob, options.filename);
}
