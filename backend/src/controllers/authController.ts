import type { Request, Response } from "express";
import { AuthService } from "../services/authService.js";

export async function register(req: Request, res: Response) {
  const result = await AuthService.register(req.body);
  return res.status(201).json({ success: true, ...result });
}

export async function login(req: Request, res: Response) {
  const result = await AuthService.login(req.body);
  return res.json({ success: true, ...result });
}

export async function getMe(req: Request, res: Response) {
  const user = await AuthService.getProfile(Number(req.user!.id));
  return res.json({ success: true, user });
}

export async function getUsers(req: Request, res: Response) {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await AuthService.getUsers(page, limit);
  return res.json({ success: true, ...result });
}

export async function updateUser(req: Request, res: Response) {
  await AuthService.updateUser(Number(req.params.id), req.body);
  return res.json({ success: true, message: "Usuário atualizado com sucesso." });
}

export async function deleteUser(req: Request, res: Response) {
  await AuthService.deleteUser(Number(req.params.id));
  return res.json({ success: true, message: "Usuário removido com sucesso." });
}