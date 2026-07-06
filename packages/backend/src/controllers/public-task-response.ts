import {
  getTaskEffectiveStatus,
  type AppFile,
  type Document,
  type FileTextIndexStatus,
  type Task,
  type User,
} from '@humanly/shared';

export type PublicTaskAvailabilityStatus = 'scheduled' | 'open' | 'ended';

export function getPublicTaskAvailabilityStatus(
  task: Pick<Task, 'isActive' | 'lifecycleStatus' | 'startDate' | 'endDate'>,
  now: Date = new Date()
): PublicTaskAvailabilityStatus {
  const effectiveStatus = getTaskEffectiveStatus(task, now);
  if (effectiveStatus === 'scheduled') return 'scheduled';
  if (effectiveStatus === 'open') return 'open';
  return 'ended';
}

export function serializePublicTaskPreview(task: Task) {
  return {
    name: task.name,
    description: task.description,
    startDate: task.startDate,
    endDate: task.endDate,
    allowGuestSubmissions: task.allowGuestSubmissions,
    availabilityStatus: getPublicTaskAvailabilityStatus(task),
  };
}

function serializePublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    profileCompleted: user.profileCompleted,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function serializePublicStartedTask(
  task: Pick<Task, 'id' | 'name' | 'description' | 'startDate' | 'endDate' | 'environmentConfig'> & {
    instructionFile?: AppFile | null;
    instructionFiles?: AppFile[];
  }
) {
  const instructionFiles = Array.isArray(task.instructionFiles)
    ? task.instructionFiles.map(serializePublicInstructionFile)
    : [];

  return {
    id: task.id,
    name: task.name,
    description: task.description,
    startDate: task.startDate,
    endDate: task.endDate,
    environmentConfig: task.environmentConfig,
    instructionFile: task.instructionFile
      ? serializePublicInstructionFile(task.instructionFile)
      : instructionFiles[0] || null,
    instructionFiles,
  };
}

function serializePublicInstructionFile(file: AppFile) {
  return {
    id: file.id,
    title: file.title,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    pageCount: file.pageCount ?? null,
    uploadStatus: file.uploadStatus,
    textIndexStatus: file.textIndexStatus as FileTextIndexStatus | undefined,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

function serializePublicDocument(document: Pick<Document, 'id' | 'title'>) {
  return {
    id: document.id,
    title: document.title,
  };
}

export interface PublicTaskStartSerializationInput {
  user: User;
  accessToken?: string;
  task: Pick<Task, 'id' | 'name' | 'description' | 'startDate' | 'endDate' | 'environmentConfig'> & {
    instructionFile?: AppFile | null;
    instructionFiles?: AppFile[];
  };
  document: Pick<Document, 'id' | 'title'>;
  publicSessionId: string;
  mode: 'guest' | 'signed-in';
}

export function serializePublicTaskStartResult(result: PublicTaskStartSerializationInput) {
  return {
    user: serializePublicUser(result.user),
    ...(result.accessToken ? { accessToken: result.accessToken } : {}),
    task: serializePublicStartedTask(result.task),
    document: serializePublicDocument(result.document),
    publicSessionId: result.publicSessionId,
    mode: result.mode,
  };
}
