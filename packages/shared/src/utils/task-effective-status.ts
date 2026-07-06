import type { TaskEffectiveStatus, TaskLifecycleStatus } from '../types/task.types';

export interface TaskEffectiveStatusInput {
  isActive?: boolean | null;
  lifecycleStatus?: TaskLifecycleStatus | null;
  startDate?: Date | string | number | null;
  endDate?: Date | string | number | null;
}

const toFiniteTime = (value: Date | string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;

  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

export const getTaskEffectiveStatus = (
  task: TaskEffectiveStatusInput,
  now: Date | string | number = new Date()
): TaskEffectiveStatus => {
  if (task.isActive === false) {
    return 'archived';
  }

  const lifecycleStatus = task.lifecycleStatus || 'active';
  if (lifecycleStatus === 'draft' || lifecycleStatus === 'paused' || lifecycleStatus === 'ended') {
    return lifecycleStatus;
  }

  const nowTime = toFiniteTime(now) ?? Date.now();
  const startTime = toFiniteTime(task.startDate);
  const endTime = toFiniteTime(task.endDate);

  if (startTime !== null && nowTime < startTime) {
    return 'scheduled';
  }

  if (endTime !== null && nowTime > endTime) {
    return 'ended';
  }

  return 'open';
};
