import type { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & {
        id?: string;
        email?: string;
        name?: string;
        role?: string;
      };
    }
  }
}

export {};
