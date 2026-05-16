jest.mock('../../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import { TaskModel } from '../../models/task.model';
import { query, queryOne } from '../../config/database';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;

describe('TaskModel task card stats', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it('returns document, event, and submission counts for admin task cards', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: 'task-1',
        userId: 'admin-1',
        name: 'Task with activity',
        taskToken: 'ABC123TOKEN',
        userIdKey: 'userId',
        startDate: new Date(),
        endDate: new Date(),
        isActive: true,
        enrolledUserCount: 1,
        documentCount: 1,
        eventCount: 14,
        submissionCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);
    mockQueryOne.mockResolvedValueOnce({ count: '1' });

    const result = await TaskModel.findByUserId('admin-1', { page: 1, limit: 20 });

    expect(result.tasks[0]).toMatchObject({
      documentCount: 1,
      eventCount: 14,
      submissionCount: 1,
    });

    const tasksSql = mockQuery.mock.calls[0][0];
    expect(tasksSql).toContain('"documentCount"');
    expect(tasksSql).toContain('"eventCount"');
    expect(tasksSql).toContain('"submissionCount"');
    expect(tasksSql).toContain('document_events');
    expect(tasksSql).toContain('submissions');
  });
});
