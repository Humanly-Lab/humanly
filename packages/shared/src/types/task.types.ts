import { WritingEnvironmentConfig } from './environment.types';

export type ExternalServiceType = 'qualtrics' | 'google-forms' | 'custom' | 'other';
export type TaskLifecycleStatus = 'draft' | 'active' | 'paused' | 'ended';
export type TaskEffectiveStatus = 'archived' | 'draft' | 'paused' | 'scheduled' | 'open' | 'ended';

export interface Task {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  taskToken: string;
  userIdKey: string;
  externalServiceType?: ExternalServiceType | null;
  externalServiceUrl?: string | null;
  allowedLlmModels?: string[];
  aiUsageLimit?: number | null;
  startDate: Date;
  endDate: Date;
  environmentConfig?: WritingEnvironmentConfig | null;
  allowGuestSubmissions: boolean;
  isActive: boolean;
  lifecycleStatus: TaskLifecycleStatus;
  effectiveStatus?: TaskEffectiveStatus;
  launchedAt?: Date | null;
  pausedAt?: Date | null;
  endedAt?: Date | null;
  deletedAt?: Date | null;
  enrolledUserCount?: number;
  documentCount?: number;
  eventCount?: number;
  submissionCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDashboardStatus = 'open' | 'archived';
export type TaskDashboardSort = 'createdAt:desc' | 'createdAt:asc' | 'name:asc' | 'name:desc';

export interface AdminTaskDashboardItem {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  taskToken: string;
  isActive: boolean;
  lifecycleStatus: TaskLifecycleStatus;
  effectiveStatus?: TaskEffectiveStatus;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
  submissionCount: number;
}

export interface AdminTaskDashboardCounts {
  open: number;
  archived: number;
}

export interface AdminTaskDashboardPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminTaskDashboardResponse {
  items: AdminTaskDashboardItem[];
  pagination: AdminTaskDashboardPagination;
  counts: AdminTaskDashboardCounts;
}

export interface TaskCreateInput {
  name: string;
  description?: string;
  userIdKey?: string;
  externalServiceType?: ExternalServiceType;
  externalServiceUrl?: string;
  allowedLlmModels?: string[];
  aiUsageLimit?: number;
  startDate: string | Date;
  endDate: string | Date;
  environmentConfig?: WritingEnvironmentConfig;
  allowGuestSubmissions?: boolean;
}

export interface TaskUpdateInput {
  name?: string;
  description?: string;
  userIdKey?: string;
  externalServiceType?: ExternalServiceType;
  externalServiceUrl?: string;
  allowedLlmModels?: string[];
  aiUsageLimit?: number;
  startDate?: string | Date;
  endDate?: string | Date;
  environmentConfig?: WritingEnvironmentConfig;
  allowGuestSubmissions?: boolean;
  isActive?: boolean;
}

export interface TaskWithSnippets extends Task {
  trackingSnippet: string;
  iframeSnippet: string;
}
