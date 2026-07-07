import assert from 'node:assert/strict';
import type { AdminTaskDashboardItem } from '@humanly/shared';
import { TaskModel, type TaskDashboardListParams } from '../models/task.model';
import { TaskService } from './task.service';

const originalFindDashboardByUserId = TaskModel.findDashboardByUserId;
const now = new Date('2026-07-07T12:00:00.000Z');

function makeDashboardItem(overrides: Partial<AdminTaskDashboardItem> = {}): AdminTaskDashboardItem {
  return {
    id: 'task-dashboard-1',
    userId: 'publisher-1',
    name: 'Dashboard Task',
    description: 'Lightweight task card',
    taskToken: 'dashboard-token',
    isActive: true,
    lifecycleStatus: 'active',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2126-01-01T00:00:00.000Z'),
    createdAt: now,
    updatedAt: now,
    submissionCount: 5,
    ...overrides,
  };
}

async function run() {
  let capturedUserId: string | null = null;
  let capturedParams: TaskDashboardListParams | null = null;

  TaskModel.findDashboardByUserId = async (userId, params) => {
    capturedUserId = userId;
    capturedParams = params;
    return {
      items: [makeDashboardItem({ isActive: false })],
      pagination: {
        page: 2,
        limit: 9,
        total: 12,
        totalPages: 2,
      },
      counts: {
        open: 20,
        archived: 12,
      },
    };
  };

  try {
    const result = await TaskService.listDashboardTasks('publisher-1', {
      status: 'archived',
      page: 2,
      limit: 9,
      search: 'essay',
      sort: 'name:asc',
    });

    assert.equal(capturedUserId, 'publisher-1');
    assert.deepEqual(capturedParams, {
      status: 'archived',
      page: 2,
      limit: 9,
      search: 'essay',
      sort: 'name:asc',
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.submissionCount, 5);
    assert.equal(result.items[0]?.effectiveStatus, 'archived');
    assert.equal('eventCount' in result.items[0]!, false);
    assert.equal('documentCount' in result.items[0]!, false);
    assert.equal('environmentConfig' in result.items[0]!, false);
    assert.deepEqual(result.pagination, {
      page: 2,
      limit: 9,
      total: 12,
      totalPages: 2,
    });
    assert.deepEqual(result.counts, {
      open: 20,
      archived: 12,
    });
  } finally {
    TaskModel.findDashboardByUserId = originalFindDashboardByUserId;
  }
}

run();
console.log('task-dashboard-list tests passed');
