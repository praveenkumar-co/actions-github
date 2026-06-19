import app from './app';
import config from './config';
import logger from './observability/logger';
import { migrate } from './db/migrate';

function startServer(): void {
  logger.info({ env: config.env }, 'Initializing platform services (TypeScript)...');

  try {
    migrate();
  } catch (err) {
    logger.fatal({ err }, 'Database migration failed. Aborting startup.');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP Server ready');
  });

  const handleShutdown = (signal: string) => {
    logger.warn({ signal }, 'Termination signal received. Starting graceful shutdown...');

    server.close(() => {
      logger.info('HTTP server terminated.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded. Force-exiting.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
console.log("Is everything ok !");
startServer();
