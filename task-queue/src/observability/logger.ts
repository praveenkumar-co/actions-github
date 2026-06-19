import pino from "pino";
import config from "../config";

const logger = pino({
  level: config.log.level,
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
  base: {
    service: "task-queue-api",
    env: config.env,
    pod: process.env.POD_NAME || "local",
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
    ],
    censor: "[REDACTED]",
  },
});

export default logger;
