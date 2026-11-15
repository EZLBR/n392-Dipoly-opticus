import type { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      // ID-02: o token identifica o usuário só pelo publicId (UUID). O id
      // inteiro é interno ao banco e nunca sai na resposta nem no token.
      user?: JwtPayload & {
        publicId?: string;
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
