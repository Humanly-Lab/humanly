import type { WritingEnvironmentConfig } from '../types';

export const WORKSPACE_SETUP_PREVIEW_HASH_KEY = 'workspacePreview';
export const WORKSPACE_SETUP_PREVIEW_MESSAGE_TYPE = 'humanly:workspace-preview-payload';
export const WORKSPACE_SETUP_PREVIEW_READY_MESSAGE_TYPE = 'humanly:workspace-preview-ready';
export const WORKSPACE_SETUP_PREVIEW_ACK_MESSAGE_TYPE = 'humanly:workspace-preview-ack';
export const WORKSPACE_SETUP_PREVIEW_STORAGE_HASH_KEY = 'workspacePreviewStorageKey';
export const WORKSPACE_SETUP_PREVIEW_STORAGE_PREFIX = 'humanly:workspace-preview:';
export const WORKSPACE_SETUP_PREVIEW_TRANSFER_TIMEOUT_MS = 5000;

export interface WorkspaceSetupPreviewTaskWindow {
  enabled: boolean;
  endDate?: string | null;
  startDate?: string | null;
}

export interface WorkspaceSetupPreviewPayload {
  allowGuestSubmissions?: boolean;
  config: WritingEnvironmentConfig;
  description?: string;
  hasPdf?: boolean;
  mode: 'personal' | 'admin';
  pdfLabel?: string;
  pdfPreviewUrl?: string;
  selectedAiModel?: string;
  taskWindow?: WorkspaceSetupPreviewTaskWindow;
  title?: string;
}

export interface WorkspaceSetupPreviewPayloadMessage {
  type: typeof WORKSPACE_SETUP_PREVIEW_MESSAGE_TYPE;
  storageKey: string;
  payload: WorkspaceSetupPreviewPayload;
}

export interface WorkspaceSetupPreviewReadyMessage {
  type: typeof WORKSPACE_SETUP_PREVIEW_READY_MESSAGE_TYPE;
  storageKey: string;
}

export interface WorkspaceSetupPreviewAckMessage {
  type: typeof WORKSPACE_SETUP_PREVIEW_ACK_MESSAGE_TYPE;
  storageKey: string;
}

function encodeBase64(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(value);
  }
  return Buffer.from(value, 'binary').toString('base64');
}

function decodeBase64(value: string): string {
  if (typeof atob === 'function') {
    return atob(value);
  }
  return Buffer.from(value, 'base64').toString('binary');
}

function toBase64Url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(paddingLength);
}

export function encodeWorkspaceSetupPreviewPayload(payload: WorkspaceSetupPreviewPayload): string {
  const json = JSON.stringify(payload);
  const encoded = encodeBase64(encodeURIComponent(json));
  return toBase64Url(encoded);
}

export function decodeWorkspaceSetupPreviewPayload(value: string): WorkspaceSetupPreviewPayload {
  const json = decodeURIComponent(decodeBase64(fromBase64Url(value)));
  return JSON.parse(json) as WorkspaceSetupPreviewPayload;
}

export function buildWorkspaceSetupPreviewHash(payload: WorkspaceSetupPreviewPayload): string {
  const encoded = encodeWorkspaceSetupPreviewPayload(payload);
  return `#${WORKSPACE_SETUP_PREVIEW_HASH_KEY}=${encoded}`;
}

export function buildWorkspaceSetupPreviewStorageHash(storageKey: string): string {
  return `#${WORKSPACE_SETUP_PREVIEW_STORAGE_HASH_KEY}=${encodeURIComponent(storageKey)}`;
}

export function getWorkspaceSetupPreviewHashValue(hash: string): string | null {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(normalizedHash);
  return params.get(WORKSPACE_SETUP_PREVIEW_HASH_KEY);
}

export function getWorkspaceSetupPreviewStorageHashValue(hash: string): string | null {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(normalizedHash);
  return params.get(WORKSPACE_SETUP_PREVIEW_STORAGE_HASH_KEY);
}
