import { apiClient } from '@/lib/api-client';

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;

export function validatePdfFile(file: File) {
  if (file.type !== 'application/pdf') {
    throw new Error('Please select a PDF file');
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error('PDF must be smaller than 50MB');
  }
}

async function getOrCreateDefaultTaskId() {
  const tasksResponse = await apiClient.get('/tasks?limit=1');

  if (tasksResponse.data.data && tasksResponse.data.data.length > 0) {
    return tasksResponse.data.data[0].id as string;
  }

  const now = new Date();
  const defaultEndDate = new Date(now);
  defaultEndDate.setFullYear(defaultEndDate.getFullYear() + 1);

  const newTaskResponse = await apiClient.post('/tasks', {
    name: 'Default Task',
    description: 'Auto-created task for document reviews',
    startDate: now.toISOString(),
    endDate: defaultEndDate.toISOString(),
  });

  const createdTask = newTaskResponse.data.data?.task || newTaskResponse.data.data;
  if (!createdTask?.id) {
    throw new Error('Failed to create default task');
  }

  return createdTask.id as string;
}

export async function uploadPdfForDocument(documentId: string, title: string, pdfFile: File) {
  validatePdfFile(pdfFile);

  const taskId = await getOrCreateDefaultTaskId();
  const formData = new FormData();

  formData.append('pdf', pdfFile);
  formData.append('title', title);
  formData.append('authors', JSON.stringify([]));
  formData.append('abstract', '');
  formData.append('keywords', JSON.stringify([]));
  formData.append('documentId', documentId);

  await apiClient.post(`/tasks/${taskId}/papers`, formData);
}

export { MAX_PDF_SIZE_BYTES };
