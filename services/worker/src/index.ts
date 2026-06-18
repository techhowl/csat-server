import { config, createLogger, database } from "@csat/shared";

const log = createLogger("worker");

let timer: NodeJS.Timeout | undefined;
let running = false;

/**
 * Placeholder job loop. Real workers will pull from a queue (BullMQ/Redis) here.
 * Kept as a single-flight poll so a slow tick never overlaps the next one.
 */
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    log.debug("worker tick", { mongo: database.isConnected() ? "up" : "down" });
    // TODO: dequeue and process jobs.
  } catch (err) {
    log.error("worker tick failed", { message: (err as Error).message });
  } finally {
    running = false;
  }
}

async function bootstrap(): Promise<void> {
  await database.connect();
  log.info("worker started", { intervalMs: config.worker.pollIntervalMs });
  timer = setInterval(() => void tick(), config.worker.pollIntervalMs);
  registerShutdown();
}

function registerShutdown(): void {
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal}, shutting down`);
    if (timer) clearInterval(timer);
    try {
      await database.disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  log.error("Fatal error during startup", { message: (err as Error).message });
  process.exit(1);
});
