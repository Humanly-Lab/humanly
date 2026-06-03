import { env } from '../config/env';
import { TaskService } from '../services/task.service';
import { logger } from '../utils/logger';

export class TimedTaskAutoSubmitJob {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start(): void {
    if (!env.taskAutoSubmitEnabled) {
      logger.info('Timed task auto-submit job disabled');
      return;
    }

    if (this.intervalId) return;

    logger.info('Starting timed task auto-submit job', {
      intervalMs: env.taskAutoSubmitIntervalMs,
      batchSize: env.taskAutoSubmitBatchSize,
    });

    void this.runOnce();
    this.intervalId = setInterval(() => {
      void this.runOnce();
    }, env.taskAutoSubmitIntervalMs);
  }

  stop(): void {
    if (!this.intervalId) return;

    clearInterval(this.intervalId);
    this.intervalId = null;
    logger.info('Stopped timed task auto-submit job');
  }

  async runOnce(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    try {
      const result = await TaskService.autoSubmitExpiredTimedTaskEnrollments(
        env.taskAutoSubmitBatchSize
      );

      if (result.claimed > 0) {
        logger.info('Timed task auto-submit job completed', result);
      }
    } catch (error) {
      logger.error('Timed task auto-submit job failed', error);
    } finally {
      this.isRunning = false;
    }
  }
}

export function startTimedTaskAutoSubmitJob(): TimedTaskAutoSubmitJob {
  const job = new TimedTaskAutoSubmitJob();
  job.start();
  return job;
}
