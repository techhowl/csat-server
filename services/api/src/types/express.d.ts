import type { Document } from "mongoose";
import type { IUser } from "../models";

/**
 * Lean/plain user shape — the data properties of IUser without the Mongoose
 * Document methods. The authenticate middleware loads the user with `.lean()`,
 * so req.user is a plain object, not a hydrated Document.
 */
type LeanUser = Omit<IUser, keyof Document>;

/**
 * Augment Express Request type to include our custom properties.
 * This allows TypeScript to recognize req.user throughout the application.
 */
declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user object (lean/plain shape).
       * Set by the authenticate middleware after verifying JWT token.
       * Contains all user properties except password.
       */
      user?: LeanUser;
    }
  }
}

// This export is necessary to make this a module
export {};
