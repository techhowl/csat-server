import winston from "winston";
import { config } from "./config";

/**
 * Structured JSON logging in production, human-readable in dev.
 *
 * Security note: never pass raw request bodies, tokens, passwords, or full
 * connection strings into the logger. Log identifiers, not secrets.
 */

// Dev format: timestamp + message.
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    ({ timestamp, message }) => `${timestamp as string} ${message as string}`
  )
);

// Prod format: timestamp + message + stack (if error) as JSON.
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Logger create method for services to create their own logger with the service name as metadata. allows for filtering by service.
export function createLogger(service: string): winston.Logger {
  return winston.createLogger({
    level: config.logLevel,
    defaultMeta: { service },
    format: config.isProduction ? prodFormat : devFormat,
    transports: [new winston.transports.Console()],
  });
}

/** Generic logger for shared-package internals. Services should make their own. */
export const logger = createLogger("shared");
