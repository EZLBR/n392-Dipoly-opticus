import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { BadRequestProblem, ConflictProblem, NotFoundProblem } from "../errors/problem.js";
import type { RegisterDTO } from "../dtos/auth/register.dto.js";
import type { LoginDTO } from "../dtos/auth/login.dto.js";
import type { UpdateUserDTO } from "../dtos/auth/update-user.dto.js";
import type { UserResponseDTO } from "../dtos/auth/user-response.dto.js";
import type { AuthResponseDTO } from "../dtos/auth/auth-response.dto.js";
import type { PaginatedUsersDTO } from "../dtos/auth/paginated-users.dto.js";

const configuredJwtSecret = process.env.JWT_SECRET;
if (!configuredJwtSecret) {
  throw new Error("FATAL: JWT_SECRET não definido nas variáveis de ambiente.");
}
const JWT_SECRET: string = configuredJwtSecret;

function toUserResponse(user: {
  publicId: string;
  nome: string;
  email: string;
  role: string | null;
  factoryName: string | null;
  criadoEm: Date | null;
}): UserResponseDTO {
  return {
    publicId: user.publicId,
    name: user.nome,
    email: user.email,
    role: user.role ?? "client",
    factoryName: user.factoryName,
    createdAt: user.criadoEm,
  };
}

export class AuthService {
  static generateToken(payload: UserResponseDTO): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  }

  static issueSession(user: Parameters<typeof toUserResponse>[0]): AuthResponseDTO {
    const response = toUserResponse(user);
    return { user: response, token: this.generateToken(response) };
  }

  static async register(dto: RegisterDTO): Promise<AuthResponseDTO> {
    const { name, email, password } = dto;

    const existing = await prisma.usuario.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictProblem("Já existe uma conta com esse email.");
    }

    const senhaHash = await bcrypt.hash(password, 10);

    const user = await prisma.usuario.create({
      data: {
        nome: name,
        email,
        senhaHash,
        role: "client",
      },
    });

    return this.issueSession(user);
  }

  static async login(dto: LoginDTO): Promise<AuthResponseDTO> {
    const { email, password } = dto;

    const user = await prisma.usuario.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestProblem("Email ou senha incorretos.");
    }

    const senhaCorreta = await bcrypt.compare(password, user.senhaHash);
    if (!senhaCorreta) {
      throw new BadRequestProblem("Email ou senha incorretos.");
    }

    return this.issueSession(user);
  }

  static async getProfile(publicId: string): Promise<UserResponseDTO> {
    const user = await prisma.usuario.findUnique({
      where: { publicId },
    });

    if (!user) {
      throw new NotFoundProblem("Usuário não encontrado.");
    }

    return toUserResponse(user);
  }

  static async getUsers(page: number, limit: number): Promise<PaginatedUsersDTO> {
    const skip = (page - 1) * limit;

    const [users, totalItems] = await Promise.all([
      prisma.usuario.findMany({
        orderBy: { criadoEm: "desc" },
        skip,
        take: limit,
      }),
      prisma.usuario.count(),
    ]);

    return {
      users: users.map(toUserResponse),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  // ID-02: o publicId é resolvido na própria escrita; zero linhas = 404.
  static async updateUser(publicId: string, dto: UpdateUserDTO): Promise<void> {
    const { name, factoryName } = dto;

    const { count } = await prisma.usuario.updateMany({
      where: { publicId },
      data: {
        nome: name,
        factoryName: factoryName ?? null,
      },
    });

    if (count === 0) {
      throw new NotFoundProblem("Usuário não encontrado.");
    }
  }

  static async deleteUser(publicId: string): Promise<void> {
    const { count } = await prisma.usuario.deleteMany({
      where: { publicId },
    });

    if (count === 0) {
      throw new NotFoundProblem("Usuário não encontrado.");
    }
  }
}
