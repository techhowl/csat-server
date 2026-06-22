import { Router } from "express";
import { healthRouter } from "./health";

/**
 * Root router — mount every feature router here. `app.ts` mounts this one
 * aggregator, so adding a feature is a single line below with no churn in the
 * composition root.
 */
export const router = Router();

router.use("/", healthRouter);
