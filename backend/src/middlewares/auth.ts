import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { ForbiddenProblem, UnauthorizedProblem } from "../errors/problem.js";
import "../config/env.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not set in environment.");
  process.exit(1);
}

export function protect(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new UnauthorizedProblem("Access denied. No token provided."));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string);
    if (typeof decoded === "string") {
      return next(new UnauthorizedProblem("Invalid or expired token."));
    }
    req.user = decoded; // Attach payload (id, email, name, role)
    next();
  } catch {
    return next(new UnauthorizedProblem("Invalid or expired token."));
  }
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
