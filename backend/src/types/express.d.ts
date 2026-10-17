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
      requestId?: string;
      /** Bytes crus do corpo (capturados no `verify` do express.json). */
      rawBody?: Buffer;
    }
  }
}

export {};
