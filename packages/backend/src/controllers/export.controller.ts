import { Request, Response } from 'express';
import { ExportService, ExportFilters } from '../services/export.service';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

/**
 * Export events as JSON
 * GET /api/v1/tasks/:taskId/export/json
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - sessionIds: comma-separated UUIDs (optional)
 * - userIds: comma-separated external user IDs (optional)
 */
export async function exportJSON(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.taskId;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  // Parse query parameters
  const filters: ExportFilters = {};

  if (req.query.startDate) {
    filters.startDate = req.query.startDate as string;
    // Validate ISO date format
    if (isNaN(Date.parse(filters.startDate))) {
      throw new AppError(400, 'Invalid startDate format. Expected ISO date string.');
    }
  }

  if (req.query.endDate) {
    filters.endDate = req.query.endDate as string;
    // Validate ISO date format
    if (isNaN(Date.parse(filters.endDate))) {
      throw new AppError(400, 'Invalid endDate format. Expected ISO date string.');
    }
  }

  if (req.query.sessionIds) {
    const sessionIdsStr = req.query.sessionIds as string;
    filters.sessionIds = sessionIdsStr.split(',').map((id) => id.trim());
    // Basic UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of filters.sessionIds) {
      if (!uuidRegex.test(id)) {
        throw new AppError(400, `Invalid session ID format: ${id}`);
      }
    }
  }

  if (req.query.userIds) {
    const userIdsStr = req.query.userIds as string;
    filters.userIds = userIdsStr.split(',').map((id) => id.trim());
  }

  logger.info('JSON export requested', {
    taskId,
    userId,
    filters,
  });

  // Get export stream
  const { stream, metadata } = await ExportService.exportToJSON(
    taskId,
    userId,
    filters
  );

  // Generate filename
  const filename = ExportService.generateFilename(taskId, 'json');

  // Set response headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache');

  // Stream response
  stream.pipe(res);

  // Handle stream errors
  stream.on('error', (error) => {
    logger.error('Error streaming JSON export', {
      error: error instanceof Error ? error.message : 'Unknown error',
      taskId,
      userId,
    });

    // If headers already sent, can't send error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Export failed',
        message: 'An error occurred while exporting data',
      });
    }
  });

  // Log completion
  stream.on('end', () => {
    logger.info('JSON export stream completed', {
      taskId,
      userId,
      totalEvents: metadata.totalEvents,
    });
  });
}

/**
 * Export events as CSV
 * GET /api/v1/tasks/:taskId/export/csv
 * Query params:
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - sessionIds: comma-separated UUIDs (optional)
 * - userIds: comma-separated external user IDs (optional)
 */
export async function exportCSV(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const taskId = req.params.taskId;

  if (!taskId) {
    throw new AppError(400, 'Task ID is required');
  }

  // Parse query parameters
  const filters: ExportFilters = {};

  if (req.query.startDate) {
    filters.startDate = req.query.startDate as string;
    // Validate ISO date format
    if (isNaN(Date.parse(filters.startDate))) {
      throw new AppError(400, 'Invalid startDate format. Expected ISO date string.');
    }
  }

  if (req.query.endDate) {
    filters.endDate = req.query.endDate as string;
    // Validate ISO date format
    if (isNaN(Date.parse(filters.endDate))) {
      throw new AppError(400, 'Invalid endDate format. Expected ISO date string.');
    }
  }

  if (req.query.sessionIds) {
    const sessionIdsStr = req.query.sessionIds as string;
    filters.sessionIds = sessionIdsStr.split(',').map((id) => id.trim());
    // Basic UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of filters.sessionIds) {
      if (!uuidRegex.test(id)) {
        throw new AppError(400, `Invalid session ID format: ${id}`);
      }
    }
  }

  if (req.query.userIds) {
    const userIdsStr = req.query.userIds as string;
    filters.userIds = userIdsStr.split(',').map((id) => id.trim());
  }

  logger.info('CSV export requested', {
    taskId,
    userId,
    filters,
  });

  // Get export stream
  const { stream, metadata } = await ExportService.exportToCSV(
    taskId,
    userId,
    filters
  );

  // Generate filename
  const filename = ExportService.generateFilename(taskId, 'csv');

  // Set response headers
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache');

  // Stream response
  stream.pipe(res);

  // Handle stream errors
  stream.on('error', (error) => {
    logger.error('Error streaming CSV export', {
      error: error instanceof Error ? error.message : 'Unknown error',
      taskId,
      userId,
    });

    // If headers already sent, can't send error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Export failed',
        message: 'An error occurred while exporting data',
      });
    }
  });

  // Log completion
  stream.on('end', () => {
    logger.info('CSV export stream completed', {
      taskId,
      userId,
      totalEvents: metadata.totalEvents,
    });
  });
}
