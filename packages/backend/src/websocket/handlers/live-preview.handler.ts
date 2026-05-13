import { Server as SocketIOServer } from 'socket.io';
import { TypedSocket } from '../socket-server';
import { TaskModel } from '../../models/task.model';
import { logger } from '../../utils/logger';
import {
  getTaskRoom,
  broadcastToTask,
  getConnectedUsersInTask,
  JoinTaskData,
  LeaveTaskData,
} from '../../utils/websocket';

/**
 * Handle client joining a task room
 * Verifies user owns the task before allowing them to join
 */
export async function handleJoinTask(
  io: SocketIOServer,
  socket: TypedSocket,
  data: JoinTaskData
): Promise<void> {
  const { userId, email } = socket.data;
  const { taskId, token } = data;

  try {
    // Validate input
    if (!taskId) {
      logger.warn('Join task failed: Missing taskId', {
        socketId: socket.id,
        userId,
      });
      socket.emit('error', {
        message: 'Task ID is required',
        code: 'MISSING_TASK_ID',
      });
      return;
    }

    // Verify user owns the task
    const ownsTask = await TaskModel.verifyOwnership(taskId, userId);

    if (!ownsTask) {
      logger.warn('Join task failed: User does not own task', {
        socketId: socket.id,
        userId,
        taskId,
      });
      socket.emit('error', {
        message: 'You do not have access to this task',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    // Check if task exists and is active
    const task = await TaskModel.findById(taskId);

    if (!task) {
      logger.warn('Join task failed: Task not found', {
        socketId: socket.id,
        userId,
        taskId,
      });
      socket.emit('error', {
        message: 'Task not found',
        code: 'TASK_NOT_FOUND',
      });
      return;
    }

    if (!task.isActive) {
      logger.warn('Join task failed: Task is not active', {
        socketId: socket.id,
        userId,
        taskId,
      });
      socket.emit('error', {
        message: 'Task is not active',
        code: 'TASK_INACTIVE',
      });
      return;
    }

    // Join the task room
    const room = getTaskRoom(taskId);
    await socket.join(room);

    // Add to socket's task rooms tracking
    socket.data.taskRooms.add(taskId);

    logger.info('User joined task room', {
      socketId: socket.id,
      userId,
      email,
      taskId,
      room,
    });

    // Get current connected users count
    const connectedUsers = await getConnectedUsersInTask(io, taskId);

    logger.debug('Task room status', {
      taskId,
      room,
      connectedUsers: connectedUsers.length,
      userIds: connectedUsers,
    });
  } catch (error) {
    logger.error('Failed to join task room', {
      socketId: socket.id,
      userId,
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    socket.emit('error', {
      message: 'Failed to join task room',
      code: 'JOIN_FAILED',
    });
  }
}

/**
 * Handle client leaving a task room
 */
export async function handleLeaveTask(
  io: SocketIOServer,
  socket: TypedSocket,
  data: LeaveTaskData
): Promise<void> {
  const { userId, email } = socket.data;
  const { taskId } = data;

  try {
    // Validate input
    if (!taskId) {
      logger.warn('Leave task failed: Missing taskId', {
        socketId: socket.id,
        userId,
      });
      socket.emit('error', {
        message: 'Task ID is required',
        code: 'MISSING_TASK_ID',
      });
      return;
    }

    // Leave the task room
    const room = getTaskRoom(taskId);
    await socket.leave(room);

    // Remove from socket's task rooms tracking
    socket.data.taskRooms.delete(taskId);

    logger.info('User left task room', {
      socketId: socket.id,
      userId,
      email,
      taskId,
      room,
    });

    // Get remaining connected users count
    const connectedUsers = await getConnectedUsersInTask(io, taskId);

    logger.debug('Task room status after leave', {
      taskId,
      room,
      connectedUsers: connectedUsers.length,
      userIds: connectedUsers,
    });
  } catch (error) {
    logger.error('Failed to leave task room', {
      socketId: socket.id,
      userId,
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    socket.emit('error', {
      message: 'Failed to leave task room',
      code: 'LEAVE_FAILED',
    });
  }
}

/**
 * Helper to broadcast events to a task room
 * This can be called from other services to push updates to clients
 */
export function broadcastEventToTask(
  io: SocketIOServer,
  taskId: string,
  eventName: 'event-received' | 'session-started' | 'session-ended',
  data: any
): void {
  broadcastToTask(io, taskId, eventName, data);
}

/**
 * Get list of connected users in a task
 * Useful for showing who is currently viewing live preview
 */
export async function getTaskConnectedUsers(
  io: SocketIOServer,
  taskId: string
): Promise<string[]> {
  return getConnectedUsersInTask(io, taskId);
}

/**
 * Setup all live preview event handlers for a socket
 */
export function setupLivePreviewHandlers(
  io: SocketIOServer,
  socket: TypedSocket
): void {
  // Handle join task
  socket.on('join-task', (data) => {
    handleJoinTask(io, socket, data);
  });

  // Handle leave task
  socket.on('leave-task', (data) => {
    handleLeaveTask(io, socket, data);
  });

  logger.debug('Live preview handlers setup', {
    socketId: socket.id,
    userId: socket.data.userId,
  });
}
