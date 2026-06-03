jest.mock('../../models/task.model');
jest.mock('../../config/database', () => ({
  pool: {
    connect: jest.fn(),
  },
}));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { pool } from '../../config/database';
import { TaskModel } from '../../models/task.model';
import { ExportService } from '../../services/export.service';

const MockTaskModel = TaskModel as jest.Mocked<typeof TaskModel>;
const mockPool = pool as jest.Mocked<typeof pool>;

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('ExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockTaskModel.verifyOwnership.mockResolvedValue(true);
    MockTaskModel.findById.mockResolvedValue({
      id: 'task-1',
      name: 'QA Task',
      description: 'Export QA',
    } as any);
  });

  function mockClient(rows: any[][] = []) {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ count: String(rows.length) }] })
        .mockResolvedValueOnce({ rows }),
      release: jest.fn(),
    };
    mockPool.connect.mockResolvedValue(client as any);
    return client;
  }

  it('exports JSON without relying on pg query-stream events', async () => {
    const client = mockClient([
      ['tracker', 'event-1', 'session-1', 'task-1', 'student-1', 'keydown', new Date('2026-05-16T12:00:00.000Z'), 'editor', '65', 'a', '', 'a', 1, 0, 1, { source: 'qa' }, null, null],
      ['document', 'doc-event-1', 'session-1', 'task-1', 'student@example.com', 'input', new Date('2026-05-16T12:01:00.000Z'), null, null, null, 'a', 'ab', 2, 0, 2, { source: 'editor' }, 'document-1', 'user-1'],
    ]);

    const { stream, metadata } = await ExportService.exportToJSON('task-1', 'owner-1');
    const text = await streamToString(stream);
    const json = JSON.parse(text);

    expect(metadata.totalEvents).toBe(2);
    expect(json.task.id).toBe('task-1');
    expect(json.events[0]).toEqual(expect.objectContaining({
      id: 'event-1',
      eventSource: 'tracker',
      eventType: 'keydown',
      externalUserId: 'student-1',
    }));
    expect(json.events[1]).toEqual(expect.objectContaining({
      id: 'doc-event-1',
      eventSource: 'document',
      documentId: 'document-1',
      externalUserId: 'student@example.com',
    }));
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it('exports CSV without relying on pg query-stream events', async () => {
    const client = mockClient([
      ['document', 'doc-event-1', 'session-1', 'task-1', 'student@example.com', 'paste', new Date('2026-05-16T12:00:00.000Z'), null, null, null, 'a', 'a,b', 3, 0, 3, { source: 'qa' }, 'document-1', 'user-1'],
    ]);

    const { stream, metadata } = await ExportService.exportToCSV('task-1', 'owner-1');
    const text = await streamToString(stream);

    expect(metadata.totalEvents).toBe(1);
    expect(text).toContain('event_source,id,session_id,task_id,document_id,user_id');
    expect(text).toContain('document,doc-event-1,session-1,task-1,document-1,user-1,student@example.com,paste');
    expect(text).toContain('"a,b"');
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it('builds exports from tracker and document event stores', async () => {
    const client = mockClient([]);

    await ExportService.exportToJSON('task-1', 'owner-1', {
      userIds: ['student@example.com'],
    });

    const countSql = client.query.mock.calls[0][0] as string;
    const exportQuery = client.query.mock.calls[1][0] as { text: string; values: unknown[] };

    expect(countSql).toContain('UNION ALL');
    expect(countSql).toContain('document_events');
    expect(countSql).toContain('task_enrollments');
    expect(exportQuery.text).toContain("'tracker'::text as event_source");
    expect(exportQuery.text).toContain("'document'::text as event_source");
    expect(exportQuery.values).toEqual(['task-1', ['student@example.com']]);
  });
});
