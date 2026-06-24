import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps async route handlers to automatically catch errors and pass them to next().
 * This eliminates the need for try-catch blocks in every async route handler.
 * 
 * @param fn - The async route handler function
 * @returns A wrapped function that catches any errors and passes them to next()
 * 
 * @example
 * // Instead of:
 * router.get('/users/:id', async (req, res, next) => {
 *   try {
 *     const user = await User.findById(req.params.id);
 *     res.json(user);
 *   } catch (error) {
 *     next(error);
 *   }
 * });
 * 
 * // Use:
 * router.get('/users/:id', asyncHandler(async (req, res) => {
 *   const user = await User.findById(req.params.id);
 *   res.json(user);
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Execute the async function and catch any errors
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
