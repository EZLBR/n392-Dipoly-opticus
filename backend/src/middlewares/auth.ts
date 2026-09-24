import type { NextFunction, Request, Response } from "express";
import {
  routerGuard,
  RouterGuard,
  IRouterGuard,
  RouterGuardOptions,
  UserRole,
  RoleRouterGuard,
  getJwtSecret,
} from "./routerGuard.js";

export {
  routerGuard,
  RouterGuard,
  IRouterGuard,
  RouterGuardOptions,
  UserRole,
  RoleRouterGuard,
  getJwtSecret,
};

export function protect(req: Request, res: Response, next: NextFunction) {
  return routerGuard()(req, res, next);
}

// Optional middleware to restrict route access by role
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role || "")) {
      return res.status(403).json({ success: false, error: "Access forbidden. Insufficient permissions." });
    }
    next();
  };
}

