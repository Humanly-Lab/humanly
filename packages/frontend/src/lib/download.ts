export type DownloadOutcome = 'downloaded';

export function downloadBlob(blob: Blob, filename: string): DownloadOutcome {
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
  }, 0);

  return 'downloaded';
}
