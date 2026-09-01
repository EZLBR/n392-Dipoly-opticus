import type { Request, Response } from "express";
import { AuthService } from "../service/authService.js";

export async function register(req: Request, res: Response) {
  try {
    const result = await AuthService.register(req.body);
    return res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || "Falha no registro. Tente novamente.",
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const result = await AuthService.login(req.body);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || "Falha no login. Tente novamente.",
    });
  }
}

export async function getMe(req: Request, res: Response) {
  try {
    const user = await AuthService.getProfile(Number(req.user!.id));
    return res.json({ success: true, user });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || "Falha ao carregar perfil.",
    });
  }
}

export async function getUsers(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await AuthService.getUsers(page, limit);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || "Falha ao carregar usuários.",
    });
  }
}

export async function updateUser(req: Request, res: Response) {
  try {
    await AuthService.updateUser(Number(req.params.id), req.body);
    return res.json({ success: true, message: "Usuário atualizado com sucesso." });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || "Falha ao atualizar usuário.",
    });
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    await AuthService.deleteUser(Number(req.params.id));
    return res.json({ success: true, message: "Usuário removido com sucesso." });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || "Falha ao remover usuário.",
    });
  }
}
