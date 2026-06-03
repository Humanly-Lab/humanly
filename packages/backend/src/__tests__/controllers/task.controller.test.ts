jest.mock('../../services/task.service');
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { Request, Response } from 'express';

import {
  getPublicTask,
  submitPublicTaskDocument,
} from '../../controllers/task.controller';
import { TaskService } from '../../services/task.service';

const MockTaskService = TaskService as jest.Mocked<typeof TaskService>;

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as any;
}

function makeRes(): jest.Mocked<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
}

function makeTask(overrides: Partial<any> = {}): any {
  return {
    id: 'task-1',
    userId: 'admin-1',
    name: 'Public Reflection',
    description: 'Write a short reflection.',
    taskToken: 'share-token-1',
    userIdKey: 'userId',
    externalServiceType: null,
    externalServiceUrl: null,
    allowedLlmModels: ['GPT-4o mini'],
    aiUsageLimit: 100,
    startDate: new Date(Date.now() - 60_000),
    endDate: new Date(Date.now() + 60_000),
    environmentConfig: {
      aiAccess: 'full',
      submission: {
        minCharacters: 100,
      },
    },
    allowGuestSubmissions: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getPublicTask', () => {
  it('returns only public preview fields for open tasks', async () => {
    MockTaskService.getPublicTask.mockResolvedValue(makeTask());

    const req = makeReq({ params: { token: 'share-token-1' } });
    const res = makeRes();

    await getPublicTask(req, res);

    expect(MockTaskService.getPublicTask).toHaveBeenCalledWith('share-token-1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        task: expect.objectContaining({
          name: 'Public Reflection',
          description: 'Write a short reflection.',
          allowGuestSubmissions: true,
          availabilityStatus: 'open',
        }),
      },
    });

    const task = (res.json.mock.calls[0][0] as any).data.task;
    expect(task).not.toHaveProperty('id');
    expect(task).not.toHaveProperty('environmentConfig');
    expect(task).not.toHaveProperty('isActive');
  });

  it('marks scheduled public task previews', async () => {
    MockTaskService.getPublicTask.mockResolvedValue(makeTask({
      startDate: new Date(Date.now() + 60_000),
      endDate: new Date(Date.now() + 120_000),
    }));

    const req = makeReq({ params: { token: 'share-token-1' } });
    const res = makeRes();

    await getPublicTask(req, res);

    expect((res.json.mock.calls[0][0] as any).data.task.availabilityStatus).toBe('scheduled');
  });

  it('marks ended public task previews', async () => {
    MockTaskService.getPublicTask.mockResolvedValue(makeTask({
      startDate: new Date(Date.now() - 120_000),
      endDate: new Date(Date.now() - 60_000),
    }));

    const req = makeReq({ params: { token: 'share-token-1' } });
    const res = makeRes();

    await getPublicTask(req, res);

    expect((res.json.mock.calls[0][0] as any).data.task.availabilityStatus).toBe('ended');
  });
});

describe('submitPublicTaskDocument', () => {
  it('returns 410 without creating public submissions directly', async () => {
    const req = makeReq({
      params: { token: 'share-token-1' },
      body: {
        plainText: 'A direct public submission body.',
        sessionId: 'browser-session-1',
      },
    });
    const res = makeRes();

    await submitPublicTaskDocument(req, res);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Direct public submissions are no longer supported. Start the task document first.',
      message: 'Direct public submissions are no longer supported. Start the task document first.',
    });
    expect(MockTaskService.getPublicTask).not.toHaveBeenCalled();
    expect(MockTaskService.startPublicTaskDocument).not.toHaveBeenCalled();
  });
});
