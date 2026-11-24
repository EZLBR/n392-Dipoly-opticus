import type { Request, Response } from "express";
import type { GoogleExchangeDTO, GoogleStartDTO } from "../dtos/auth/google.dto.js";
import { googleAuthorizationUrl, signInWithGoogle } from "../services/googleAuth.js";

export function startGoogleLogin(req: Request, res: Response) {
  const locale = req.acceptsLanguages("en", "pt") === "pt" ? "pt-BR" : "en";
  const url = googleAuthorizationUrl(req.body as GoogleStartDTO, locale);
  return res.set("Cache-Control", "no-store").json({ url });
}

export async function exchangeGoogleLogin(req: Request, res: Response) {
  const session = await signInWithGoogle(req.body as GoogleExchangeDTO);
  return res.set("Cache-Control", "no-store").json(session);
}
