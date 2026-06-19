import express, { Router, Request, Response } from 'express';
import { getDb } from '../db/client';
import { getRedisConnection } from '../queue/client';
import logger from '../observability/logger';

const router: Router = express.Router();

router.get('/healthz', (req: Request, res: Response) => {
  logger.info('Health route is working perfectly ');
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

router.get('/readyz', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    const redis = getRedisConnection();
    await redis.ping();
    return res.status(200).json({
      status: 'ready',
      checks: {
        database: 'connected',
        redis: 'connected',
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Readiness probe failed');
    return res.status(503).json({
      status: 'down',
      error: err.message,
    });
  }
});
export default router;
