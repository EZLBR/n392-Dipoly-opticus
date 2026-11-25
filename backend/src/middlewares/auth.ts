import type { NextFunction, Request, Response } from "express";
import { ForbiddenProblem, UnauthorizedProblem } from "../errors/problem.js";
import "../config/env.js";
import { routerGuard, RoleRouterGuard, getJwtSecret } from "./routerGuard.js";

// Tipos saem com `export type`: o tsx (esbuild) compila arquivo por arquivo e
// não sabe que eles não existem em runtime. Reexportá-los como valor fazia o
// `npm run dev` falhar no import ("does not provide an export named ...").
export type { RouterGuard, IRouterGuard, RouterGuardOptions, UserRole } from "./routerGuard.js";
export { routerGuard, RoleRouterGuard, getJwtSecret, ForbiddenProblem, UnauthorizedProblem };

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
