import promClient from 'prom-client'; // prometheus
import config from '../config';

const register = new promClient.Registry();

promClient.collectDefaultMetrics({
  register,
  prefix: config.metrics.prefix,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

export const httpRequestsTotal = new promClient.Counter({
  name: `${config.metrics.prefix}http_requests_total`,
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new promClient.Histogram({
  name: `${config.metrics.prefix}http_request_duration_seconds`,
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const queueDepth = new promClient.Gauge({
  name: `${config.metrics.prefix}queue_depth`,
  help: 'Number of jobs currently waiting in the queue',
  labelNames: ['queue_name'],
  registers: [register],
});

export const jobsProcessedTotal = new promClient.Counter({
  name: `${config.metrics.prefix}jobs_processed_total`,
  help: 'Total number of jobs processed',
  labelNames: ['queue_name', 'status'],
  registers: [register],
});

export const jobDurationSeconds = new promClient.Histogram({
  name: `${config.metrics.prefix}job_duration_seconds`,
  help: 'Job processing duration in seconds',
  labelNames: ['queue_name'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [register],
});

export const tasksTotal = new promClient.Gauge({
  name: `${config.metrics.prefix}tasks_total`,
  help: 'Total tasks by status',
  labelNames: ['status'],
  registers: [register],
});

export { register };
