import api from './api-client';
import type { ChatImageAttachment } from '@humanly/shared';

/**
 * Upload a single image file via `POST /api/v1/ai/chat/attachments` and
 * return the descriptor the chat send path passes back on the next
 * `ai:message` frame (#93). Image bytes never reach the websocket
 * channel — the backend resolves the `storageKey` to a `data:` URL on
 * dispatch.
 */
export async function uploadChatImage(file: File): Promise<ChatImageAttachment> {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post<{
    success: boolean;
    data: { storageKey: string; mimeType: string; filename: string; size: number };
  }>('/ai/chat/attachments', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const { storageKey, mimeType, filename } = response.data;
  return {
    type: 'image',
    storageKey,
    mimeType,
    filename,
  };
}

/**
 * Browser-side guard: refuse files larger than 10 MB or with a non-image
 * MIME type before kicking off the upload. Matches the multer cap and
 * MIME validation the backend route enforces, so the user sees a single
 * client-side toast instead of a roundtrip error.
 */
export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_CHAT_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export function validateChatImage(file: File): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED_CHAT_IMAGE_MIME.has(file.type)) {
    return { ok: false, reason: `Unsupported image type: ${file.type || 'unknown'}` };
  }
  if (file.size > MAX_CHAT_IMAGE_BYTES) {
    return { ok: false, reason: 'Image must be 10 MB or smaller' };
  }
  return { ok: true };
}
