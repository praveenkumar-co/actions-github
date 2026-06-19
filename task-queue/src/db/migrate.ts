import fs from 'fs';
import path from 'path';
import { getDb } from './client';
import logger from '../observability/logger';

export function migrate(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      filename  TEXT NOT NULL UNIQUE,
      run_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  logger.info('Base schema applied');

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    logger.info('No migrations directory found, skipping');
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const ran = db.prepare('SELECT id FROM _migrations WHERE filename = ?').get(filename);
    if (ran) {
      logger.debug({ filename }, 'Migration already applied, skipping');
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(filename);
    })();

    logger.info({ filename }, 'Migration applied');
  }

  logger.info('All migrations complete');
}

if (require.main === module) {
  migrate();
}
