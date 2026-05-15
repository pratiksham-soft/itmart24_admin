import type { NextFunction, Request, Response } from "express";
import { getAdminProfile } from "../services/adminAuth.service";

export type AuthenticatedAdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthenticatedAdminRequest = Request & {
  adminUser?: AuthenticatedAdminUser;
};

const getBearerToken = (authorizationHeader: string | undefined) => {
  const authorization = String(authorizationHeader ?? "");
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
};

export const requireAdminAuth = async (
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await getAdminProfile(getBearerToken(req.headers.authorization));
    req.adminUser = profile.user;
    next();
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Authentication is required.";

    res.status(401).json({
      success: false,
      message,
    });
  }
};
