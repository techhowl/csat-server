# @csat/shared

Foundation library imported by every service. One place for config, logging, and
the database connection.

## Exports

| Export                          | What it is                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `config` / `AppConfig`          | Typed application config, read once from the environment.                                                                          |
| `createLogger(name)` / `logger` | Structured winston logger.                                                                                                         |
| `database` / `mongoose`         | The **singleton** Mongoose connection (one per process) — `database.connect()`, `database.disconnect()`, `database.isConnected()`. |

## Usage

```ts
import { config, createLogger, database } from "@csat/shared";

const log = createLogger("api");
await database.connect();
```

Never open a second Mongoose connection — import this `database`. Don't read
`process.env` directly in feature code; add to `config` instead.

See the [architecture overview](../../docs/architecture/overview.md).
