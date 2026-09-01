// ============================================================
//   AUTH CONTROLLER
//   Registro, Login e perfil de usuário
//   Banco: PostgreSQL via pg (pool de conexões)
// ============================================================

import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not set in environment.");
  process.exit(1);
}

// ─── Helper: gera JWT ─────────────────────────────────────
function generateToken(payload: jwt.JwtPayload) {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "7d" });
}

// ─────────────────────────────────────────────────────────
//   REGISTRO
//   POST /api/auth/register
// ─────────────────────────────────────────────────────────
export async function register(req: Request, res: Response) {
  const { name, email, password } = req.body;

  // Validação básica
  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      error: "Por favor, informe nome, email e senha."
    });
  }

  // Validação de Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: "Formato de email inválido."
    });
  }

  // Validação de Senha Forte
  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      error: "A senha deve ter pelo menos 8 caracteres."
    });
  }
  if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
    return res.status(400).json({
      success: false,
      error: "A senha deve conter letras e números."
    });
  }

  // Security Fix: Ignore requested role and force "client" for public registration
  const userRole = "client";
  const userFactoryName = null;
  const normEmail   = String(email).trim().toLowerCase();

  try {
    // 1. Verifica se o email já existe
    const { rows: existing } = await pool.query(
      "SELECT id FROM usuarios WHERE email = $1",
      [normEmail]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Já existe uma conta com esse email."
      });
    }

    // 2. Gera hash da senha
    const senhaHash = await bcrypt.hash(password, 10);

    // 3. Insere o usuário no banco
    const { rows: result } = await pool.query(
      "INSERT INTO usuarios (nome, email, senha_hash, role, factory_name) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [
        name.trim(),
        normEmail,
        senhaHash,
        userRole,
        userFactoryName
      ]
    );

    const userId = result[0].id;

    // 4. Gera o token JWT
    const payload = {
      id:          userId,
      name:        name.trim(),
      email:       normEmail,
      role:        userRole,
      factoryName: userFactoryName
    };
    const token = generateToken(payload);

    return res.status(201).json({ success: true, token, user: payload });

  } catch (err) {
    console.error("Erro no registro:", err);
    return res.status(500).json({
      success: false,
      error: "Falha no registro. Tente novamente."
    });
  }
}

// ─────────────────────────────────────────────────────────
//   LOGIN
//   POST /api/auth/login
// ─────────────────────────────────────────────────────────
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Por favor, informe email e senha."
    });
  }

  const normEmail = String(email).trim().toLowerCase();

  try {
    // 1. Busca o usuário pelo email
    const { rows } = await pool.query(
      "SELECT * FROM usuarios WHERE email = $1",
      [normEmail]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Email ou senha incorretos."
      });
    }

    const user = rows[0];

    // 2. Compara a senha
    const senhaCorreta = await bcrypt.compare(password, user.senha_hash);
    if (!senhaCorreta) {
      return res.status(400).json({
        success: false,
        error: "Email ou senha incorretos."
      });
    }

    // 3. Gera token JWT
    const payload = {
      id:          user.id,
      name:        user.nome,
      email:       user.email,
      role:        user.role,
      factoryName: user.factory_name
    };
    const token = generateToken(payload);

    return res.json({ success: true, token, user: payload });

  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).json({
      success: false,
      error: "Falha no login. Tente novamente."
    });
  }
}

// ─────────────────────────────────────────────────────────
//   PERFIL DO USUÁRIO AUTENTICADO
//   GET /api/auth/me
// ─────────────────────────────────────────────────────────
export async function getMe(req: Request, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT
        id,
        nome         AS name,
        email,
        role,
        factory_name AS "factoryName",
        criado_em    AS "createdAt"
       FROM usuarios
       WHERE id = $1`,
      [req.user!.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Usuário não encontrado."
      });
    }

    return res.json({ success: true, user: rows[0] });

  } catch (err) {
    console.error("Erro ao buscar perfil:", err);
    return res.status(500).json({
      success: false,
      error: "Falha ao carregar perfil."
    });
  }
}

// ─────────────────────────────────────────────────────────
//   LISTAR TODOS OS USUÁRIOS (apenas staff)
//   GET /api/auth/users
// ─────────────────────────────────────────────────────────
export async function getUsers(req: Request, res: Response) {
  const page = parseInt(String(req.query.page || "")) || 1;
  const limit = parseInt(String(req.query.limit || "")) || 20;
  const offset = (page - 1) * limit;

  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM usuarios`);
    const totalCount = parseInt(countRes.rows[0].count);

    const { rows } = await pool.query(
      `SELECT
        id,
        nome         AS name,
        email,
        role,
        factory_name AS "factoryName",
        criado_em    AS "createdAt"
       FROM usuarios
       ORDER BY criado_em DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.json({
      success: true,
      users: rows,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (err) {
    console.error("Erro ao listar usuários:", err);
    return res.status(500).json({
      success: false,
      error: "Falha ao carregar usuários."
    });
  }
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR USUÁRIO
//   PUT /api/auth/users/:id
// ─────────────────────────────────────────────────────────
export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  const { name, factoryName } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: "Nome é obrigatório." });
  }

  try {
    const { rowCount } = await pool.query(
      "UPDATE usuarios SET nome = $1, factory_name = $2 WHERE id = $3",
      [name.trim(), factoryName || null, id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: "Usuário não encontrado." });
    }

    return res.json({ success: true, message: "Usuário atualizado com sucesso." });

  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    return res.status(500).json({ success: false, error: "Falha ao atualizar usuário." });
  }
}

// ─────────────────────────────────────────────────────────
//   DELETAR USUÁRIO
//   DELETE /api/auth/users/:id
// ─────────────────────────────────────────────────────────
export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM usuarios WHERE id = $1",
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: "Usuário não encontrado." });
    }

    return res.json({ success: true, message: "Usuário removido com sucesso." });

  } catch (err) {
    console.error("Erro ao deletar usuário:", err);
    return res.status(500).json({ success: false, error: "Falha ao remover usuário." });
  }
}
