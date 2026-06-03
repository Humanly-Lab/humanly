import type { Task } from '@humanly/shared';

export type TaskDashboardTab = 'open' | 'archived';

export interface TaskDashboardItem extends Task {
  eventCount?: number;
  sessionCount?: number;
  enrolledUserCount?: number;
  documentCount?: number;
  submissionCount?: number;
  aiUsageLimit?: number | null;
  allowedAiModels?: string[];
  allowedLlmModels?: string[];
  inviteCode?: string;
}

export interface TaskWindowStatus {
  label: 'Scheduled' | 'Open now' | 'Ended';
  tone: 'muted' | 'success' | 'warning';
}

export const getTaskDashboardTab = (task: Pick<TaskDashboardItem, 'isActive'>): TaskDashboardTab => (
  task.isActive ? 'open' : 'archived'
);

export const getTaskWindowStatus = (
  task: Pick<TaskDashboardItem, 'startDate' | 'endDate'>,
  nowMs = Date.now()
): TaskWindowStatus => {
  const startMs = new Date(task.startDate).getTime();
  const endMs = new Date(task.endDate).getTime();

  if (Number.isFinite(startMs) && nowMs < startMs) {
    return { label: 'Scheduled', tone: 'muted' };
  }

  if (Number.isFinite(endMs) && nowMs > endMs) {
    return { label: 'Ended', tone: 'warning' };
  }

  return { label: 'Open now', tone: 'success' };
};

export const filterTasksForDashboard = (
  tasks: TaskDashboardItem[],
  activeTab: TaskDashboardTab,
  searchQuery: string
) => {
  const query = searchQuery.trim().toLowerCase();

  return tasks.filter((task) => {
    if (getTaskDashboardTab(task) !== activeTab) return false;
    if (!query) return true;

    return (
      task.name.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query)
    );
  });
};

export const getTaskDashboardTabCountText = (
  count: number,
  activeTab: TaskDashboardTab,
  hasSearchQuery: boolean
) => {
  const statusLabel = activeTab === 'open' ? 'open' : 'archived';
  const taskLabel = count === 1 ? 'task' : 'tasks';

  return `${count.toLocaleString()} ${statusLabel} ${taskLabel}${hasSearchQuery ? ' found' : ''}`;
};

export const getTaskActiveStateAction = (nextIsActive: boolean) => {
  if (nextIsActive) {
    return {
      label: 'Restore Task',
      pendingLabel: 'Restoring...',
      confirmMessage: "Restore this task? Invite codes and public share links will work again within the task's configured start and end dates.",
    };
  }

  return {
    label: 'Archive Task',
    pendingLabel: 'Archiving...',
    confirmMessage: 'Archive this task? Invite codes and public share links will stop working until the task is restored. Existing submissions and analytics will remain available.',
  };
};
