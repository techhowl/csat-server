/**
 * Model layer — Mongoose schemas/models live here, one file per collection
 * (e.g. `survey.ts`, `response.ts`), re-exported from this barrel so callers do
 * `import { Survey } from "../models"`.
 *
 * Empty for now: the health endpoint reads no persisted state. The first
 * feature that touches a collection adds its model here.
 */

// Export User model and interface
export { User, IUser } from "./user";

// Export RefreshToken model and interface
export { RefreshToken, IRefreshToken } from "./refresh-token";
