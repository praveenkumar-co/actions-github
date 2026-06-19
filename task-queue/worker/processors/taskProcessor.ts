import { Job } from "bullmq";
import taskRepository from "../../src/repositories/taskRepository";
import logger from "../../src/observability/logger";

export interface TaskJobData {
  taskId: string;
  payload: Record<string, any>;
}

export async function taskProcessor(job: Job<TaskJobData>): Promise<void> {
  const { taskId, payload } = job.data;
  logger.info(
    { taskId, jobId: job.id, attempt: job.attemptsMade + 1 },
    "Worker processing task",
  );
  try {
    taskRepository.updateStatus(taskId, "processing", {
      startedAt: new Date().toISOString(),
      attempts: job.attemptsMade + 1,
    });
  } catch (dbErr) {
    logger.error(
      { taskId, dbErr },
      "Failed to set task status to processing in database",
    );
    throw dbErr;
  }
  try {
    await executeWorkload(taskId, payload);

    taskRepository.updateStatus(taskId, "completed", {
      completedAt: new Date().toISOString(),
    });
    logger.info({ taskId }, "Task completed successfully");
  } catch (workErr: any) {
    const errorDetail = {
      message: workErr.message,
      stack: workErr.stack,
      attempt: job.attemptsMade + 1,
    };

    logger.warn(
      { taskId, attempt: job.attemptsMade + 1, error: workErr.message },
      "Task attempt failed",
    );
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);
    if (isLastAttempt) {
      taskRepository.updateStatus(taskId, "failed", {
        completedAt: new Date().toISOString(),
        error: errorDetail,
      });
      logger.error(
        { taskId },
        "Task execution exhausted all retries. Job marked as failed.",
      );
    } else {
      taskRepository.updateStatus(taskId, "pending", {
        error: errorDetail,
      });
    }
    throw workErr;
  }
}
async function executeWorkload(
  taskId: string,
  payload: Record<string, any>,
): Promise<void> {
  const duration = payload.durationMs || 1500;

  await new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      if (payload.shouldFail) {
        return reject(new Error("Simulated task execution failure"));
      }
      resolve();
    }, duration);
  });
}
