import type { AnalyticsSummary, WritingAnomalyFlag } from '@humanly/shared';

export type TaskDetailTab = 'overview' | 'submission' | 'users' | 'analytics' | 'setting';

export const TASK_DETAIL_TABS: Array<{ value: TaskDetailTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'submission', label: 'Submission' },
  { value: 'users', label: 'Users' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'setting', label: 'Setting' },
];

export const getTaskDetailTabs = (canEditSettings: boolean) => (
  canEditSettings ? TASK_DETAIL_TABS : TASK_DETAIL_TABS.filter((tab) => tab.value !== 'setting')
);

export const parseTaskDetailTab = (value: string | null): TaskDetailTab => (
  TASK_DETAIL_TABS.some((tab) => tab.value === value) ? (value as TaskDetailTab) : 'overview'
);

export const taskDetailTabHref = (taskId: string, tab: TaskDetailTab) => (
  tab === 'overview' ? `/tasks/${taskId}` : `/tasks/${taskId}?tab=${tab}`
);

export interface TaskStats extends AnalyticsSummary {
  lastActivity?: Date;
}

export interface TaskEnrollment {
  id: string;
  taskId: string;
  userId: string;
  email: string;
  documentId: string | null;
  documentTitle: string | null;
  joinedAt: string;
  submissionCount: number;
  eventCount: number;
  lastActivity: string | null;
}

export interface AdminSubmission {
  id: string;
  userId: string;
  userEmail?: string | null;
  documentId: string;
  documentTitle?: string | null;
  certificateId?: string | null;
  certificateVerificationToken?: string | null;
  submittedAt: string;
  anomalyFlags?: WritingAnomalyFlag[] | null;
  aiPolicyRefusalCount?: number;
  status: 'active' | 'historical';
}
