jest.mock('../../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import { query } from '../../config/database';
import { DocumentEventModel } from '../../models/document-event.model';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('DocumentEventModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
  });

  describe('batchInsert', () => {
    it('preserves empty text snapshots instead of coercing them to null', async () => {
      await DocumentEventModel.batchInsert([
        {
          documentId: 'doc-1',
          userId: 'user-1',
          eventType: 'delete',
          timestamp: new Date('2026-05-20T12:00:00.000Z'),
          keyCode: 'Backspace',
          textBefore: 'Whole document text',
          textAfter: '',
          cursorPosition: 0,
          selectionStart: 0,
          selectionEnd: 0,
        },
      ]);

      const params = mockQuery.mock.calls[0][1] as unknown[];

      expect(params[7]).toBe('Whole document text');
      expect(params[8]).toBe('');
    });
  });
});
