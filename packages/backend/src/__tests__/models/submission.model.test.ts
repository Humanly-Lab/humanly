jest.mock('../../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import { query } from '../../config/database';
import { SubmissionModel } from '../../models/submission.model';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('SubmissionModel', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('includes owner-visible AI policy refusal counts in task submissions', async () => {
    mockQuery.mockResolvedValueOnce([]);

    await SubmissionModel.listForTask('task-1');

    const sql = mockQuery.mock.calls[0][0];
    const params = mockQuery.mock.calls[0][1] as unknown[];

    expect(sql).toContain('ai_policy_refusal');
    expect(sql).toContain('"aiPolicyRefusalCount"');
    expect(sql).toContain('de.timestamp <= s.submitted_at');
    expect(params).toEqual(['task-1']);
  });
});
