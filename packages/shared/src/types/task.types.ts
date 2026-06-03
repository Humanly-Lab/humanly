import { WritingEnvironmentConfig } from './environment.types';

export type ExternalServiceType = 'qualtrics' | 'google-forms' | 'custom' | 'other';

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
  enrolledUserCount?: number;
  documentCount?: number;
  eventCount?: number;
  submissionCount?: number;
  createdAt: Date;
  updatedAt: Date;
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
