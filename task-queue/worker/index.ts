import { Worker, Job, RedisConnection } from 'bullmq';
import config from '../src/config';
import { getRedisOptions } from '../src/queue/client';
import { taskProcessor, TaskJobData } from './processors/taskProcessor';
import logger from '../src/observability/logger';
import * as metrics from '../src/observability/metrics';

const connection = getRedisOptions();

logger.info({ queueName: config.queue.name }, 'Starting background worker...');

const worker = new Worker<TaskJobData>(
  config.queue.name,
  taskProcessor,
  {
    connection,
    concurrency: config.queue.concurrency, 
  }
);
worker.on('active', (job: Job) => {
  logger.debug({ jobId: job.id }, 'Job is now active');
});
worker.on('completed', (job: Job) => {
  metrics.jobsProcessedTotal.inc({ queue_name: config.queue.name, status: 'completed' });
  if (job.finishedOn && job.processedOn) {
    const durationInSeconds = (job.finishedOn - job.processedOn) / 1000;
    metrics.jobDurationSeconds.observe({ queue_name: config.queue.name }, durationInSeconds);
  }
});
worker.on('failed', (job: Job | undefined, err: Error) => {
  metrics.jobsProcessedTotal.inc({ queue_name: config.queue.name, status: 'failed' });
  logger.error({ jobId: job?.id, err: err.message }, 'Job execution failed');
});
worker.on('error', (err) => {
  logger.error({ err }, 'Worker system level error');
});


// graceful shuddown

const handleShutdown = async (signal: string) => {
  logger.warn({ signal }, 'Stopping background worker...');
  
  // Closing the worker waits for active jobs to complete (up to the process timeout)
  await worker.close();
  logger.info('Worker process stopped successfully.');
  process.exit(0);
};
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));