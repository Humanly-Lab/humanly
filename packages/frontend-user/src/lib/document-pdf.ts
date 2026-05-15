import { fileApi } from '@/lib/file-api';

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

export function validatePdfFile(file: File) {
  if (file.type !== 'application/pdf') {
    throw new Error('Please select a PDF file');
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error('PDF must be smaller than 50MB');
  }
}

export async function uploadPdfForDocument(documentId: string, title: string, pdfFile: File) {
  validatePdfFile(pdfFile);
  await fileApi.uploadDocumentPdf(documentId, title, pdfFile);
}

export { MAX_PDF_SIZE_BYTES };
