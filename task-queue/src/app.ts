import express, { Application, Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import config from './config';
import logger from './observability/logger';
import * as metrics from './observability/metrics';
import tasksRouter from './routes/task';
import healthRouter from './routes/health';

const app: Application = express();

app.use(express.json());

app.use(
  pinoHttp({
    logger,
    customLogLevel: (req, res, _err) => {
      if (req.url === '/healthz' || req.url === '/readyz') return 'silent';
      if (res.statusCode && res.statusCode >= 500) return 'error';
      if (res.statusCode && res.statusCode >= 400) return 'warn';
      return 'info';
    },
  })
);

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/metrics' || req.path === '/healthz' || req.path === '/readyz') {
    return next();
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.route.path : req.path;

    metrics.httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    });

    metrics.httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      },
      durationInSeconds
    );
  });

  next();
});

app.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

app.use('/tasks', tasksRouter);
app.use('/', healthRouter);

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  logger.error({ err, path: req.path }, 'Express route execution error');
  res.status(status).json({
    error: {
      message: config.isProduction ? 'Internal Server Error' : err.message,
      ...(config.isProduction ? {} : { stack: err.stack }),
    },
  });
});

export default app;
