import Redis, { RedisOptions } from "ioredis";
import config from "../config";
import logger from "../observability/logger";

let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (redisConnection) return redisConnection;

  logger.info(
    { host: config.redis.host, port: config.redis.port },
    "Connecting to Redis queue broker...",
  );

  redisConnection = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
    // Connection retry strategy (reconnect on network loss)
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000); // Backoff capped at 3s
      logger.warn(
        { attempt: times, delay },
        "Redis connection lost. Retrying...",
      );
      return delay;
    },
  });
  redisConnection.on("connect", () => {
    logger.info("Redis connection successfully established");
  });
  redisConnection.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });
  return redisConnection;
}

export function getRedisOptions(): RedisOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      logger.warn(
        { attempt: times, delay },
        "Redis connection lost. Retrying...",
      );
      return delay;
    },
  };
}
const cleanup = async () => {
  if (redisConnection) {
    await redisConnection.quit();
    logger.info("Redis connection closed cleanly");
  }
};
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
