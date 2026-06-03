jest.mock('../../services/task.service', () => ({
  TaskService: {
    createTask: jest.fn(),
    getTask: jest.fn(),
    listTasks: jest.fn(),
    joinTaskByInviteCode: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import request from 'supertest';
import { createApp } from '../../app';
import { TaskService } from '../../services/task.service';
import { generateAccessToken } from '../../utils/jwt';

const MockTaskService = TaskService as jest.Mocked<typeof TaskService>;
const app = createApp();

function tokenFor(role: 'admin' | 'user'): string {
  return generateAccessToken({
    userId: `${role}-1`,
    email: `${role}@example.com`,
    role,
  });
}

function validTaskPayload() {
  return {
    name: 'Owner Access Task',
    description: 'Regression coverage for authenticated task owner routes',
    startDate: new Date(Date.now() - 60_000).toISOString(),
    endDate: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe('task route authenticated owner boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated task owner route requests', async () => {
    const response = await request(app).get('/api/v1/tasks');
    expect(response.status).toBe(401);

    expect(MockTaskService.listTasks).not.toHaveBeenCalled();
    expect(MockTaskService.createTask).not.toHaveBeenCalled();
    expect(MockTaskService.getTask).not.toHaveBeenCalled();
  });

  it('allows user-role tokens to access authenticated task owner routes', async () => {
    MockTaskService.listTasks.mockResolvedValue({
      tasks: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    } as any);
    MockTaskService.createTask.mockResolvedValue({
      id: 'task-1',
      userId: 'user-1',
      name: 'Owner Access Task',
      description: 'Regression coverage for authenticated task owner routes',
      taskToken: 'ABCDEF123456',
      startDate: new Date(),
      endDate: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    MockTaskService.getTask.mockResolvedValue({
      id: 'task-1',
      userId: 'user-1',
      name: 'Owner Access Task',
      description: 'Regression coverage for authenticated task owner routes',
      taskToken: 'ABCDEF123456',
      startDate: new Date(),
      endDate: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const userToken = tokenFor('user');

    const listResponse = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${userToken}`);

    expect(listResponse.status).toBe(200);
    expect(MockTaskService.listTasks).toHaveBeenCalledWith(
      'user-1',
      { page: 1, limit: 20 },
      undefined
    );

    const createResponse = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .send(validTaskPayload());

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(MockTaskService.createTask).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Owner Access Task' })
    );

    const detailResponse = await request(app)
      .get('/api/v1/tasks/task-1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(detailResponse.status).toBe(200);
    expect(MockTaskService.getTask).toHaveBeenCalledWith(
      'task-1',
      'user-1'
    );
  });

  it('keeps user enrollment endpoints available to user-role tokens', async () => {
    MockTaskService.joinTaskByInviteCode.mockResolvedValue({
      id: 'task-1',
      name: 'Enrollment Task',
      description: null,
      startDate: new Date(),
      endDate: new Date(),
      environmentConfig: null,
      enrolledUserCount: 1,
      taskToken: 'ABCDEF123456',
    } as any);

    const response = await request(app)
      .post('/api/v1/tasks/join')
      .set('Authorization', `Bearer ${tokenFor('user')}`)
      .send({ inviteCode: 'ABCDEF' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(MockTaskService.joinTaskByInviteCode).toHaveBeenCalledWith('ABCDEF', 'user-1');
  });
});
