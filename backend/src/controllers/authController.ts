import type { Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { BadRequestProblem } from "../errors/problem.js";
import { parsePagination } from "../utils/pagination.js";

export async function register(req: Request, res: Response) {
  const result = await AuthService.register(req.body);
  return res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const result = await AuthService.login(req.body);
  return res.json(result);
}

export async function getMe(req: Request, res: Response) {
  const user = await AuthService.getProfile(Number(req.user!.id));
  return res.json({ ...user, user });
}

export async function getUsers(req: Request, res: Response) {
  const pagination = parsePagination(req.query);
  if (!pagination.isValid) {
    throw new BadRequestProblem(pagination.error);
  }
  const { page, limit } = pagination;
  const result = await AuthService.getUsers(page, limit);
  return res.json(result);
}

export async function updateUser(req: Request, res: Response) {
  await AuthService.updateUser(Number(req.params.id), req.body);
  return res.json({ message: "Usuário atualizado com sucesso." });
}

export async function deleteUser(req: Request, res: Response) {
  await AuthService.deleteUser(Number(req.params.id));
  return res.json({ message: "Usuário removido com sucesso." });
}