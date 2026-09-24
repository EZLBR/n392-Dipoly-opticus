import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import "../config/env.js";

export type UserRole = "client" | "factory" | "staff" | string;

export interface RouterGuardOptions {
  /** Papéis autorizados a acessar a rota. Se omitido ou vazio, apenas exige autenticação. */
  roles?: UserRole[];
  /** Se true, requisições sem token não são bloqueadas, mas req.user é populado se houver token válido. */
  allowAnonymous?: boolean;
}

/** Contrato funcional do middleware de guarda do Express */
export interface RouterGuard {
  (req: Request, res: Response, next: NextFunction): void | Promise<void> | unknown;
}

/** Contrato orientado a objeto / classe para guards avaliáveis */
export interface IRouterGuard {
  canActivate(req: Request, res?: Response): boolean | Promise<boolean>;
  handle?(req: Request, res: Response, next: NextFunction): void | Promise<void> | unknown;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("FATAL ERROR: JWT_SECRET is not set in environment.");
  }
  return secret;
}

function parseGuardOptions(
  optionsOrRole?: RouterGuardOptions | UserRole | UserRole[],
  ...restRoles: UserRole[]
): RouterGuardOptions {
  if (!optionsOrRole) {
    return {};
  }

  if (typeof optionsOrRole === "object" && !Array.isArray(optionsOrRole)) {
    return optionsOrRole;
  }

  if (Array.isArray(optionsOrRole)) {
    return { roles: [...optionsOrRole, ...restRoles] };
  }

  return { roles: [optionsOrRole, ...restRoles] };
}

/**
 * Cria um middleware de Router Guard para o Express.
 *
 * Exemplos de uso:
 * - routerGuard() -> exige autenticação (qualquer papel)
 * - routerGuard("staff") -> exige autenticação e papel staff
 * - routerGuard("staff", "factory") -> exige autenticação e um dos papéis
 * - routerGuard(["staff", "factory"]) -> formato array
 * - routerGuard({ roles: ["staff"] }) -> formato opções
 */
export function routerGuard(
  optionsOrRole?: RouterGuardOptions | UserRole | UserRole[],
  ...restRoles: UserRole[]
): RouterGuard {
  const options = parseGuardOptions(optionsOrRole, ...restRoles);
  const allowedRoles = options.roles;

  const guardMiddleware: RouterGuard = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (options.allowAnonymous) {
        return next();
      }
      return res.status(401).json({
        success: false,
        error: "Access denied. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];

    try {
      const secret = getJwtSecret();
      const decoded = jwt.verify(token, secret);

      if (typeof decoded === "string") {
        return res.status(401).json({
          success: false,
          error: "Invalid or expired token.",
        });
      }

      req.user = decoded; // Attach payload (id, email, name, role)

      if (allowedRoles && allowedRoles.length > 0) {
        const userRole = req.user.role || "";
        if (!allowedRoles.includes(userRole)) {
          return res.status(403).json({
            success: false,
            error: "Access forbidden. Insufficient permissions.",
          });
        }
      }

      next();
    } catch (_err) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token.",
      });
    }
  };

  return guardMiddleware;
}

/**
 * Classe que implementa o contrato IRouterGuard para avaliação orientada a objeto.
 */
export class RoleRouterGuard implements IRouterGuard {
  private readonly allowedRoles?: UserRole[];
  private readonly allowAnonymous: boolean;

  constructor(options?: RouterGuardOptions | UserRole | UserRole[]) {
    const parsed = parseGuardOptions(options);
    this.allowedRoles = parsed.roles;
    this.allowAnonymous = parsed.allowAnonymous ?? false;
  }

  canActivate(req: Request, _res?: Response): boolean {
    if (!req.user) {
      return this.allowAnonymous;
    }

    if (!this.allowedRoles || this.allowedRoles.length === 0) {
      return true;
    }

    const userRole = req.user.role || "";
    return this.allowedRoles.includes(userRole);
  }

  handle(req: Request, res: Response, next: NextFunction): void | Promise<void> | unknown {
    const guard = routerGuard({
      roles: this.allowedRoles,
      allowAnonymous: this.allowAnonymous,
    });
    return guard(req, res, next);
  }
}
