export interface Config {
  env: string;
  port: number;
  isProduction: boolean;
  isTest: boolean;
  db: {
    path: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    maxRetriesPerRequest: null;
  };
  queue: {
    name: string;
    concurrency: number;
    keepCompleted: number;
    keepFailed: number;
  };
  log: {
    level: string;
  };
  metrics: {
    prefix: string;
  };
}

const config: Config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",

  db: {
    path: process.env.DB_PATH || "./data/tasks.db",
  },

  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  },

  queue: {
    name: process.env.QUEUE_NAME || "task-processing",
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5", 10),
    keepCompleted: parseInt(process.env.QUEUE_KEEP_COMPLETED || "100", 10),
    keepFailed: parseInt(process.env.QUEUE_KEEP_FAILED || "500", 10),
  },

  log: {
    level:
      process.env.LOG_LEVEL ||
      (process.env.NODE_ENV === "production" ? "info" : "debug"),
  },

  metrics: {
    prefix: process.env.METRICS_PREFIX || "taskqueue_",
  },
};

function validateConfig(cfg: Config): void {
  const required: string[] = [];
  if (cfg.isProduction && !process.env.REDIS_HOST) {
    required.push("REDIS_HOST");
  }
  if (required.length > 0) {
    throw new Error(
      `Missing required environment variables: ${required.join(", ")}\n` +
        "Check your Kubernetes ConfigMap and Secret manifests.",
    );
  }
}

validateConfig(config);

export default config;
