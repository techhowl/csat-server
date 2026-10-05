import type { Request, Response } from "express";
import type {
  GoogleAuthInput,
  LoginInput,
  RefreshInput,
  SignupInput,
  UpdateProfileInput,
} from "../dto/auth.dto";
import * as authService from "../services/auth";
import { UnauthorizedError } from "../utils/errors";

/**
 * Controller layer for /auth — maps HTTP onto the auth service. Bodies are
 * already parsed and normalised by `validate(schema)` in the route, so
 * `req.body` is exactly the DTO type here.
 */

// POST /auth/signup — 201 with the new user and a token pair.
export async function signup(req: Request, res: Response): Promise<void> {
  const result = await authService.signup(req.body as SignupInput);
  res.status(201).json(result);
}

// POST /auth/login — 200 with the user and a token pair.
export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);
  res.status(200).json(result);
}

// POST /auth/refresh — 200 with a rotated token pair.
export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshInput;
  const tokens = await authService.refresh(refreshToken);
  res.status(200).json({ tokens });
}

// POST /auth/logout — 204; ends the session the refresh token belongs to.
export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshInput;
  await authService.logout(refreshToken);
  res.status(204).end();
}

// POST /auth/logout-all — 204; ends every session of the authenticated user.
export async function logoutAll(req: Request, res: Response): Promise<void> {
  await authService.logoutAll(String(currentUser(req)._id));
  res.status(204).end();
}

// POST /auth/google — 201 when the Google sign-in created the account, 200
// when it signed into (or linked) an existing one. Same body as login.
export async function googleAuth(req: Request, res: Response): Promise<void> {
  const { created, ...result } = await authService.googleAuth(
    req.body as GoogleAuthInput
  );
  res.status(created ? 201 : 200).json(result);
}

// GET /auth/me — 200 with the authenticated user.
export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getCurrentUser(String(currentUser(req)._id));
  res.status(200).json({ user });
}

// PATCH /auth/me — 200 { user } or, after a password set/change, { user, tokens }.
export async function updateMe(req: Request, res: Response): Promise<void> {
  const result = await authService.updateProfile(
    String(currentUser(req)._id),
    req.body as UpdateProfileInput
  );
  res.status(200).json(result);
}

// `authenticate` guarantees req.user on these routes; the guard keeps the
// handlers safe if one is ever mounted without it. The lean user carries `_id`
// at runtime even though the LeanUser type omits Document keys.
function currentUser(req: Request) {
  if (!req.user) {
    throw new UnauthorizedError("Authentication required");
  }
  return req.user as typeof req.user & { _id: unknown };
}
