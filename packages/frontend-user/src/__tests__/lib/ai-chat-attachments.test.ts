/**
 * Tests for the client-side chat-image upload helper (issue #93).
 * Locks the validate-before-upload contract so the user sees the same
 * 10 MB / png-jpeg-webp-gif limits the backend route enforces, and the
 * upload helper hits the right endpoint with the right multipart field.
 */

import {
  validateChatImage,
  ALLOWED_CHAT_IMAGE_MIME,
  MAX_CHAT_IMAGE_BYTES,
  uploadChatImage,
} from '../../lib/ai-chat-attachments';

jest.mock('../../lib/api-client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(async () => ({
      success: true,
      data: {
        storageKey: 'mock/abc',
        mimeType: 'image/png',
        filename: 'shot.png',
        size: 1234,
      },
    })),
  },
}));

import api from '../../lib/api-client';

function makeFile(type: string, sizeBytes: number, name = 'shot.png'): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

describe('validateChatImage', () => {
  it('accepts every whitelisted MIME under the size cap', () => {
    for (const mime of ALLOWED_CHAT_IMAGE_MIME) {
      const result = validateChatImage(makeFile(mime, 1024));
      expect(result).toEqual({ ok: true });
    }
  });

  it('rejects non-image MIME types', () => {
    const result = validateChatImage(makeFile('application/pdf', 1024));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('Unsupported') });
  });

  it('rejects images over the 10 MB cap', () => {
    const result = validateChatImage(makeFile('image/png', MAX_CHAT_IMAGE_BYTES + 1));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('10 MB') });
  });

  it('rejects empty-type files (browser drag with no type)', () => {
    const result = validateChatImage(makeFile('', 1024));
    expect(result.ok).toBe(false);
  });
});

describe('uploadChatImage', () => {
  beforeEach(() => {
    (api.post as jest.Mock).mockClear();
  });

  it('posts the file to /ai/chat/attachments as multipart "image" and returns a ChatImageAttachment', async () => {
    const file = makeFile('image/png', 512, 'shot.png');
    const result = await uploadChatImage(file);
    expect(api.post).toHaveBeenCalledWith(
      '/ai/chat/attachments',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'multipart/form-data' }),
      }),
    );
    expect(result).toEqual({
      type: 'image',
      storageKey: 'mock/abc',
      mimeType: 'image/png',
      filename: 'shot.png',
    });
  });
});
