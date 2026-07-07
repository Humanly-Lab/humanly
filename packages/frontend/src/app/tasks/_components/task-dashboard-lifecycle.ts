import { getTaskEffectiveStatus, type AdminTaskDashboardItem, type TaskEffectiveStatus } from '@humanly/shared';

export type TaskDashboardTab = 'open' | 'archived';

export type TaskDashboardItem = AdminTaskDashboardItem;

export interface TaskWindowStatus {
  label: 'Draft' | 'Scheduled' | 'Active' | 'Paused' | 'Ended' | 'Archived';
  tone: 'muted' | 'success' | 'warning';
  effectiveStatus: TaskEffectiveStatus;
}

export const getTaskDashboardTab = (task: Pick<TaskDashboardItem, 'isActive'>): TaskDashboardTab => (
  task.isActive ? 'open' : 'archived'
);

export const getTaskWindowStatus = (
  task: Pick<TaskDashboardItem, 'lifecycleStatus' | 'startDate' | 'endDate'> & Partial<Pick<TaskDashboardItem, 'isActive'>>,
  nowMs = Date.now()
): TaskWindowStatus => {
  const effectiveStatus = getTaskEffectiveStatus(task, nowMs);

  switch (effectiveStatus) {
    case 'archived':
      return { label: 'Archived', tone: 'muted', effectiveStatus };
    case 'draft':
      return { label: 'Draft', tone: 'muted', effectiveStatus };
    case 'scheduled':
      return { label: 'Scheduled', tone: 'muted', effectiveStatus };
    case 'paused':
      return { label: 'Paused', tone: 'warning', effectiveStatus };
    case 'ended':
      return { label: 'Ended', tone: 'warning', effectiveStatus };
    case 'open':
    default:
      return { label: 'Active', tone: 'success', effectiveStatus };
  }
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
