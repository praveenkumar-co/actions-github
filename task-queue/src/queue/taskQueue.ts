import { Queue, Job } from 'bullmq';
import config from '../config';
import { getRedisOptions } from './client';
import logger from '../observability/logger';

const connection = getRedisOptions();

export const taskQueue = new Queue(config.queue.name, {
  connection,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential', 
      delay: 1000,         
    },
    // BullMQ stores completed/failed jobs in Redis. We must prune them!
    removeOnComplete: {
      age: 24 * 3600, 
      count: config.queue.keepCompleted,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,        
      count: config.queue.keepFailed, 
    },
  },
});
logger.info({ queueName: config.queue.name }, 'BullMQ task queue registered');