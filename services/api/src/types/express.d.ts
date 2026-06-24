import type { IUser } from "../models";

/**
 * Augment Express Request type to include our custom properties.
 * This allows TypeScript to recognize req.user throughout the application.
 */
declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user object.
       * Set by the authenticate middleware after verifying JWT token.
       * Contains all user properties except password.
       */
      user?: IUser;
    }
  }
}

// This export is necessary to make this a module
export {};
