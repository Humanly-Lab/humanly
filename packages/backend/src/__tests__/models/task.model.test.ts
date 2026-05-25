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

  it('keeps public share and invite lookups limited to active tasks', async () => {
    mockQueryOne.mockResolvedValue(null);

    await TaskModel.findByToken('share-token-1');
    await TaskModel.findByInviteCode('ABC123');

    const publicShareSql = mockQueryOne.mock.calls[0][0];
    expect(publicShareSql).toContain('p.task_token = $1');
    expect(publicShareSql).toContain('p.is_active = TRUE');

    const inviteCodeSql = mockQueryOne.mock.calls[1][0];
    expect(inviteCodeSql).toContain('SUBSTRING(p.task_token FROM 1 FOR 6)');
    expect(inviteCodeSql).toContain('p.is_active = TRUE');
    expect(mockQueryOne).toHaveBeenNthCalledWith(1, expect.any(String), ['share-token-1']);
    expect(mockQueryOne).toHaveBeenNthCalledWith(2, expect.any(String), ['ABC123']);
  });
});
