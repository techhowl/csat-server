import type { Request, Response } from "express";

// 404 handler — mounted after all routes. Generic body, no stack or internals.
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not Found" });
}
