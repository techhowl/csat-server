import type { Server } from "node:http";
import { config, createLogger, database } from "@csat/shared";
import { createApp } from "./app";

// Create a logger instance for the API service.
const log = createLogger("api");

// Main entry point: connect to the database, start the HTTP server, and register shutdown handlers.
async function bootstrap(): Promise<void> {
  // Singleton Mongo connection — established once, reused across the process.
  await database.connect();
  // Start the Express server.
  const app = createApp();
  console.log("Bootstrapping CSAT API service...");
  const server: Server = app.listen(config.api.port, () => {
    log.info(`API listening`, { port: config.api.port, env: config.nodeEnv });
  });

 // shut down handler for graceful shutdown
  registerShutdown(server);
}

 // shut down handler for graceful shutdown
function registerShutdown(server: Server): void {
  // state for whether its shut down or not
  let shuttingDown = false;
  
   //shutdown handler where shuttingdown state is set to true server is closed , database is disconnected and processs exists. 
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal}, shutting down gracefully`);

    server.close(() => log.info("HTTP server closed"));

    try {
      await database.disconnect();
    } catch (err) {
      log.error("Error during DB disconnect", { message: (err as Error).message });
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
