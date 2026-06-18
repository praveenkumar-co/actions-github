
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import config from '../config';
import logger from '../observability/logger';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbDir = path.dirname(config.db.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.db.path, {
    verbose: config.env === 'development'
      ? (...args: unknown[]) => logger.debug({ sql: String(args[0]) }, 'db query')
      : undefined,
  });

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -65536');

  logger.info({ path: config.db.path }, 'Database connected');

  return db;
}

const cleanup = () => {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);