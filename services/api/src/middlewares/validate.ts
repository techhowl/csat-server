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
/** Request properties that can be validated and replaced in place. */
type RequestKey = "body" | "query" | "params";

/**
 * Shared factory for the validation middlewares. Parses `req[key]` against the
 * schema, replaces it with the parsed/transformed output, and converts any
 * ZodError into a `ValidationError` prefixed with `label`. Non-Zod errors are
 * forwarded to `next`.
 */
function createValidator<T extends ZodSchema>(
  schema: T,
  key: RequestKey,
  label: string
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Parse and validate the targeted request field
      const validated = schema.parse(req[key]);

      // Replace the field with the parsed and transformed data. Cast through
      // `unknown` (not `any`): express types query/params as ParsedQs /
      // ParamsDictionary, which the parsed output won't structurally match.
      req[key] = validated as unknown as Request[RequestKey];

      // Continue to next middleware
      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        // Format Zod errors into a readable message (e.g., "user.email: ...")
        const errorMessages = error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ");

        // Throw ValidationError with formatted message
        throw new ValidationError(`${label} - ${errorMessages}`);
      }

      // For non-Zod errors, pass them along
      next(error);
    }
  };
}

export function validate<T extends ZodSchema>(schema: T) {
  return createValidator(schema, "body", "Validation failed");
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
  return createValidator(schema, "query", "Query validation failed");
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
  return createValidator(schema, "params", "Parameter validation failed");
}
