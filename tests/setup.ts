import { describe } from "vitest";

/**
 * Integration suites require a live Mongo. When MONGO_URI is set they run; when
 * unset they self-skip via `describeIntegration` so a bare `npm test` passes
 * locally without Mongo.
 *
 * No DB hooks live here on purpose: this file is a global setupFile applied to
 * EVERY test file, including unit files that `vi.mock("@csat/shared")`. The
 * Mongo connect/clear/disconnect lifecycle is registered inside the integration
 * suite itself (see tests/integration/**) so mocked unit files never touch it.
 */
export const describeIntegration = process.env.MONGO_URI
  ? describe
  : describe.skip;
