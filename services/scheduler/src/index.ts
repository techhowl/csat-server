import { config, createLogger, database } from "@csat/shared";

const log = createLogger("scheduler");

let timer: NodeJS.Timeout | undefined;
let running = false;

/**
 * Placeholder cron-style tick. Real schedules (digest emails, CSAT survey
 * dispatch, cleanup jobs) get registered here — likely via node-cron later.
 * Single-flight so a long-running schedule never stacks on the next tick.
 */
async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    log.debug("scheduler tick", {
      mongo: database.isConnected() ? "up" : "down",
    });
    // TODO: evaluate due schedules and enqueue work for the worker.
  } catch (err) {
    log.error("scheduler tick failed", { message: (err as Error).message });
  } finally {
    running = false;
  }
}

async function bootstrap(): Promise<void> {
  await database.connect();
  log.info("scheduler started", {
    intervalMs: config.scheduler.tickIntervalMs,
  });
  timer = setInterval(() => void tick(), config.scheduler.tickIntervalMs);
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
