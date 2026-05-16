jest.mock('../../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import { AIChatAttachmentModel } from '../../models/ai-chat-attachment.model';
import { query, queryOne } from '../../config/database';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;

describe('AIChatAttachmentModel', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it('records the storage provider locator with ownership metadata', async () => {
    await AIChatAttachmentModel.record({
      storageKey: 'files/chat-image/key.png',
      storageProvider: 'gcs',
      storageBucket: 'humanly-prod',
      userId: 'user-1',
      mimeType: 'image/png',
      filename: 'upload.png',
      sizeBytes: 1234,
      imageBytes: Buffer.from('image-bytes'),
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('storage_provider'),
      [
        'files/chat-image/key.png',
        'gcs',
        'humanly-prod',
        'user-1',
        'image/png',
        'upload.png',
        1234,
        Buffer.from('image-bytes'),
      ],
    );
  });

  it('finds owned attachment rows with provider fallback for legacy records', async () => {
    mockQueryOne.mockResolvedValueOnce({
      storage_key: 'legacy/key',
      storage_provider: 'local',
      storage_bucket: null,
      user_id: 'user-1',
      mime_type: 'image/png',
      filename: 'upload.png',
      size_bytes: 1234,
      image_bytes: Buffer.from('image-bytes'),
      created_at: new Date(),
    });

    const row = await AIChatAttachmentModel.findOwnedByStorageKey('legacy/key', 'user-1');

    expect(row).toMatchObject({
      storage_key: 'legacy/key',
      storage_provider: 'local',
      user_id: 'user-1',
      image_bytes: Buffer.from('image-bytes'),
    });
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(storage_provider'),
      ['legacy/key', 'user-1'],
    );
  });
});
