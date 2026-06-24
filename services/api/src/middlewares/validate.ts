import type { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";
import { ValidationError } from "../utils/errors";

/**
 * Creates a validation middleware for request body using Zod schemas.
 * Automatically validates the request body and returns 400 with detailed errors if validation fails.
 * 
 * @param schema - The Zod schema to validate against
 * @returns Express middleware function
 * 
 * @example
 * // Define a schema
 * const createUserSchema = z.object({
 *   name: z.string().min(2),
 *   email: z.string().email(),
 *   password: z.string().min(8)
 * });
 * 
 * // Use in route
 * router.post('/users', 
 *   validate(createUserSchema),
 *   asyncHandler(async (req, res) => {
 *     // req.body is now type-safe and validated
 *     const user = await createUser(req.body);
 *     res.json(user);
 *   })
 * );
 */
export function validate<T extends ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Parse and validate the request body
      const validated = schema.parse(req.body);
      
      // Replace req.body with the parsed and transformed data
      req.body = validated;
      
      // Continue to next middleware
      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        // Format Zod errors into a readable message
        const errorMessages = error.issues.map(issue => {
          // Build path string (e.g., "user.email" for nested fields)
          const path = issue.path.join(".");
          return `${path}: ${issue.message}`;
        }).join(", ");
        
        // Throw ValidationError with formatted message
        throw new ValidationError(`Validation failed - ${errorMessages}`);
      }
      
      // For non-Zod errors, pass them along
      next(error);
    }
  };
}

/**
 * Validate query parameters
 * 
 * @example
 * const paginationSchema = z.object({
 *   page: z.coerce.number().min(1).default(1),
 *   limit: z.coerce.number().min(1).max(100).default(20)
 * });
 * 
 * router.get('/users',
 *   validateQuery(paginationSchema),
 *   asyncHandler(async (req, res) => {
 *     // req.query is validated and transformed
 *   })
 * );
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Parse and validate the query parameters
      const validated = schema.parse(req.query);
      
      // Replace req.query with the parsed and transformed data
      req.query = validated as any;
      
      // Continue to next middleware
      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        // Format Zod errors into a readable message
        const errorMessages = error.issues.map(issue => {
          const path = issue.path.join(".");
          return `${path}: ${issue.message}`;
        }).join(", ");
        
        // Throw ValidationError with formatted message
        throw new ValidationError(`Query validation failed - ${errorMessages}`);
      }
      
      // For non-Zod errors, pass them along
      next(error);
    }
  };
}

/**
 * Validate route parameters
 * 
 * @example
 * const idParamSchema = z.object({
 *   id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ObjectId")
 * });
 * 
 * router.get('/users/:id',
 *   validateParams(idParamSchema),
 *   asyncHandler(async (req, res) => {
 *     // req.params.id is validated
 *   })
 * );
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Parse and validate the route parameters
      const validated = schema.parse(req.params);
      
      // Replace req.params with the parsed and transformed data
      req.params = validated as any;
      
      // Continue to next middleware
      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        // Format Zod errors into a readable message
        const errorMessages = error.issues.map(issue => {
          const path = issue.path.join(".");
          return `${path}: ${issue.message}`;
        }).join(", ");
        
        // Throw ValidationError with formatted message
        throw new ValidationError(`Parameter validation failed - ${errorMessages}`);
      }
      
      // For non-Zod errors, pass them along
      next(error);
    }
  };
}
