import mongoose from "mongoose";
import { config } from "./config";
import { createLogger } from "./logger";

const log = createLogger("mongo");

/**
 * Singleton MongoDB connection.
 *
 * A single Mongoose connection (and its underlying driver pool) is created once
 * per process and reused everywhere. Calling `connect()` more than once returns
 * the same live connection instead of opening a second pool.
 *
 * Mongoose already keeps a default global connection, but wrapping it in an
 * explicit singleton gives us: a single connect/disconnect entry point, one
 * place to attach event listeners, and a guard against concurrent connect()
 * races during boot.
 */
class Database {
  // single instance of the database connection across the process
  private static instance: Database | undefined;
  // If connect() is called while a connection is already in progress, this holds the in-flight promise to avoid starting multiple connections.
  private connecting: Promise<typeof mongoose> | null = null;
  // Guard to ensure event listeners are only bound once. (Single listener)
  private listenersBound = false;

  private constructor() {}

  // Get the singleton instance of the Database class.

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  // Expose the Mongoose connection for direct access if needed.

  get connection(): mongoose.Connection {
    return mongoose.connection;
  }

  // Check if the Mongoose connection is currently established.
  isConnected(): boolean {
    // 1 === connected
    return mongoose.connection.readyState === 1;
  }

  // Connect to the MongoDB database.
  async connect(): Promise<typeof mongoose> {
    // If already connected, return the existing connection.
    if (this.isConnected()) {
      return mongoose;
    }
    // Collapse concurrent connect() calls onto a single in-flight promise.
    if (this.connecting) {
      return this.connecting;
    }

    // Bind event listeners once on the global Mongoose connection.
    this.bindListeners();

    // Fail fast instead of buffering ops forever against a dead connection.
    mongoose.set("bufferTimeoutMS", 10_000);
    mongoose.set("strictQuery", true);

    //If the connection is not established, create a new connection and store the promise.
    this.connecting = mongoose
      .connect(config.mongo.uri, {
        dbName: config.mongo.dbName,
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 20,
        minPoolSize: 2,
      })
      .then((m) => {
        log.info("MongoDB connected", { db: config.mongo.dbName });
        return m;
      })
      .catch((err) => {
        this.connecting = null;
        throw err;
      });

    // Return the connecting state so that callers can await the connection.
    return this.connecting;
  }

  // Disconnect from the MongoDB database.

  async disconnect(): Promise<void> {
    if (mongoose.connection.readyState === 0) return;
    await mongoose.disconnect();
    this.connecting = null;
    log.info("MongoDB disconnected");
  }

  // Bind event listeners to the Mongoose connection for logging connection events.

  private bindListeners(): void {
    if (this.listenersBound) return;
    this.listenersBound = true;

    mongoose.connection.on("error", (err) => {
      log.error("MongoDB connection error", {
        message: (err as Error).message,
      });
    });
    mongoose.connection.on("disconnected", () => {
      log.warn("MongoDB disconnected");
    });
    mongoose.connection.on("reconnected", () => {
      log.info("MongoDB reconnected");
    });
  }
}

/** Process-wide singleton instance. */
export const database = Database.getInstance();
export { mongoose };
