const mockClient = {
  query: jest.fn(),
};

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  transaction: jest.fn((callback) => callback(mockClient)),
}));

import { UserModel } from '../../models/user.model';
import { transaction } from '../../config/database';

const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;

describe('UserModel.deleteAccount', () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockTransaction.mockClear();
  });

  it('cleans dependent account rows before deleting the user row', async () => {
    mockClient.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('to_regclass') ? [{ tableName: 'public.optional_table' }] : [],
      rowCount: sql.includes('DELETE FROM users') ? 1 : 0,
    }));

    await expect(UserModel.deleteAccount('user-1')).resolves.toBe(true);

    const statements = mockClient.query.mock.calls.map(([sql]) => sql);
    const normalizedStatements = statements.map((sql) => sql.replace(/\s+/g, ' ').trim());
    expect(normalizedStatements).toEqual(expect.arrayContaining([
      'SELECT to_regclass($1) AS "tableName"',
      'DELETE FROM paper_access_logs WHERE reviewer_id = $1',
      'DELETE FROM review_recordings WHERE reviewer_id = $1',
      'DELETE FROM review_ai_interaction_logs WHERE reviewer_id = $1',
      'DELETE FROM review_ai_sessions WHERE reviewer_id = $1',
      'DELETE FROM review_comments WHERE reviewer_id = $1',
      'DELETE FROM review_events WHERE reviewer_id = $1',
      'DELETE FROM reviews WHERE reviewer_id = $1',
      'DELETE FROM paper_reviewers WHERE reviewer_id = $1 OR assigned_by = $1',
      'DELETE FROM papers WHERE uploaded_by = $1',
      expect.stringContaining('UPDATE submissions SET certificate_id = NULL'),
      expect.stringContaining('UPDATE certificates SET submission_id = NULL'),
      expect.stringContaining('DELETE FROM certificates'),
      expect.stringContaining('DELETE FROM submissions'),
      expect.stringContaining('DELETE FROM task_enrollments'),
      'DELETE FROM ai_chat_attachments WHERE user_id = $1',
      'DELETE FROM ai_interaction_logs WHERE user_id = $1',
      'DELETE FROM ai_chat_sessions WHERE user_id = $1',
      'DELETE FROM ai_selection_actions WHERE user_id = $1',
      'DELETE FROM user_ai_settings WHERE user_id = $1',
      'DELETE FROM user_oauth_accounts WHERE user_id = $1',
      expect.stringContaining('DELETE FROM document_events'),
      expect.stringContaining('DELETE FROM files'),
      'DELETE FROM documents WHERE user_id = $1',
      'DELETE FROM tasks WHERE user_id = $1',
      'DELETE FROM users WHERE id = $1',
    ]));
    expect(statements.at(-1)).toBe('DELETE FROM users WHERE id = $1');
    expect(mockClient.query).toHaveBeenLastCalledWith('DELETE FROM users WHERE id = $1', ['user-1']);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('skips optional peer-review cleanup when those tables are absent', async () => {
    mockClient.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('to_regclass') ? [{ tableName: null }] : [],
      rowCount: sql.includes('DELETE FROM users') ? 1 : 0,
    }));

    await expect(UserModel.deleteAccount('user-1')).resolves.toBe(true);

    const statements = mockClient.query.mock.calls.map(([sql]) => sql.replace(/\s+/g, ' ').trim());
    expect(statements).not.toContain('DELETE FROM paper_access_logs WHERE reviewer_id = $1');
    expect(statements).not.toContain('DELETE FROM review_recordings WHERE reviewer_id = $1');
    expect(statements).toEqual(expect.arrayContaining([
      expect.stringContaining('UPDATE submissions SET certificate_id = NULL'),
      expect.stringContaining('DELETE FROM certificates'),
      expect.stringContaining('DELETE FROM submissions'),
      'DELETE FROM users WHERE id = $1',
    ]));
  });

  it('returns false when no user row was deleted', async () => {
    mockClient.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('to_regclass') ? [{ tableName: null }] : [],
      rowCount: 0,
    }));

    await expect(UserModel.deleteAccount('missing-user')).resolves.toBe(false);
  });
});
