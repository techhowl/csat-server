import type { Request, Response, NextFunction } from "express";
import { AppError, UnauthorizedError } from "../utils/errors";
import { verifyAccessToken } from "../utils/jwt";
import { User } from "../models";

/**
 * Express middleware to authenticate requests using Bearer JWT tokens.
 * Extracts and verifies the access token, then attaches the user to req.user.
 *
 * @throws UnauthorizedError if token is missing, invalid, or user not found
 *
 * @example
 * // Protect a single route
 * router.get('/profile', authenticate, asyncHandler(async (req, res) => {
 *   // req.user is available here
 *   res.json(req.user);
 * }));
 *
 * // Protect all routes in a router
 * router.use(authenticate);
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract the Authorization header
    const authHeader = req.headers.authorization;

    // Check if Authorization header exists
    if (!authHeader) {
      throw new UnauthorizedError("Authorization header missing");
    }

    // Check if it's a Bearer token
    if (!authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError(
        "Invalid authorization format. Use: Bearer <token>"
      );
    }

    // Extract the token (remove "Bearer " prefix)
    const token = authHeader.substring(7);

    // Check if token exists after "Bearer "
    if (!token) {
      throw new UnauthorizedError("Access token missing");
    }

    // Verify the token and get the payload
    const payload = verifyAccessToken(token);

    // Extract userId from the payload. verifyAccessToken guarantees a string
    // userId at the auth boundary, so no sub/id fallback is needed here.
    const userId = payload.userId;

    if (!userId) {
      throw new UnauthorizedError("Invalid token payload: missing user ID");
    }

    // Fetch the user from database
    const user = await User.findById(userId)
      .select("-password") // Exclude password even if select:false fails
      .lean() // Return plain object for better performance
      .exec();

    // Check if user exists
    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedError("Account is deactivated");
    }

    // Attach user to request object
    req.user = user;

    // Continue to next middleware
    next();
  } catch (error) {
    // Pass error to error handler
    next(error);
  }
}

/**
 * Middleware to require specific user role.
 * Must be used after authenticate middleware.
 *
 * @param roles - Array of allowed roles
 * @returns Express middleware function
 *
 * @example
 * // Require admin role
 * router.delete('/users/:id',
 *   authenticate,
 *   requireRole(['admin']),
 *   asyncHandler(async (req, res) => {
 *     // Only admins can access this
 *   })
 * );
 *
 * // Require either admin or manager role
 * router.get('/reports',
 *   authenticate,
 *   requireRole(['admin', 'manager']),
 *   asyncHandler(async (req, res) => {
 *     // Admins and managers can access this
 *   })
 * );
 */
export function requireRole(roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Check if user is authenticated
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Check if user has one of the required roles. The user IS authenticated
    // but lacks the role — that's 403 Forbidden, not 401 Unauthorized.
    if (!roles.includes(req.user.role)) {
      throw new AppError("Insufficient permissions", 403);
    }

    // User has required role, continue
    next();
  };
}
