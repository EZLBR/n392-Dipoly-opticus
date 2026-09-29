import type { NextFunction, Request, Response } from "express";
import { ForbiddenProblem, UnauthorizedProblem } from "../errors/problem.js";
import "../config/env.js";
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
  ForbiddenProblem,
  UnauthorizedProblem,
};

export function protect(req: Request, res: Response, next: NextFunction) {
  return routerGuard()(req, res, next);
}

// Optional middleware to restrict route access by role
export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role || "")) {
      return next(new ForbiddenProblem("Access forbidden. Insufficient permissions."));
    }
    next();
  };
}
