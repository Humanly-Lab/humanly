import type { Document, Task, User } from '@humanly/shared';

export type PublicTaskAvailabilityStatus = 'scheduled' | 'open' | 'ended';

export function getPublicTaskAvailabilityStatus(
  task: Pick<Task, 'startDate' | 'endDate'>,
  now: Date = new Date()
): PublicTaskAvailabilityStatus {
  const nowMs = now.getTime();
  const startMs = new Date(task.startDate).getTime();
  const endMs = new Date(task.endDate).getTime();

  if (Number.isFinite(startMs) && nowMs < startMs) return 'scheduled';
  if (Number.isFinite(endMs) && nowMs > endMs) return 'ended';
  return 'open';
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
  task: Pick<Task, 'id' | 'name' | 'description' | 'startDate' | 'endDate' | 'environmentConfig'>
) {
  return {
    id: task.id,
    name: task.name,
    description: task.description,
    startDate: task.startDate,
    endDate: task.endDate,
    environmentConfig: task.environmentConfig,
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
  task: Pick<Task, 'id' | 'name' | 'description' | 'startDate' | 'endDate' | 'environmentConfig'>;
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
