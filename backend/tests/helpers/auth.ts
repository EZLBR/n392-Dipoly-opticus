// ============================================================
//   Fixtures de identidade
//
//   O token é obtido pela própria API, nunca assinado aqui. Assim
//   o helper não conhece o formato do payload, o segredo nem o
//   algoritmo — e continua funcionando quando o AUTH-01 (#55)
//   reescrever a autenticação.
//
//   Cada chamada cria um usuário novo, com e-mail único. Nenhum
//   dado é compartilhado entre testes, o que mantém a suíte
//   independente da ordem de execução.
// ============================================================

import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";

export type Papel = "client" | "factory" | "staff";

export interface UsuarioDeTeste {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  senha: string;
  token: string;
}

/** Atende à validação do registro: 8+ caracteres, com letra e número. */
const SENHA_PADRAO = "SenhaTeste123";

let contador = 0;

/**
 * Cria um usuário com o papel pedido e devolve um token válido.
 *
 * O cadastro público força `client` por segurança, então papéis
 * privilegiados são promovidos no banco antes do login — que é como
 * eles nascem na vida real (criados por um staff, não por registro).
 */
export async function criarUsuario(
  papel: Papel = "client",
  opcoes: { nomeDaFabrica?: string } = {}
): Promise<UsuarioDeTeste> {
  const n = ++contador;
  const nome = `Usuario Teste ${n}`;
  const email = `teste-${n}-${Date.now()}@exemplo.invalid`;

  const registro = await request(app)
    .post("/api/auth/register")
    .send({ name: nome, email, password: SENHA_PADRAO });

  if (registro.status !== 201 && registro.status !== 200) {
    throw new Error(
      `Falha ao registrar usuário de teste (${registro.status}): ${JSON.stringify(registro.body)}`
    );
  }

  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM usuarios WHERE email = $1",
    [email]
  );
  const id = rows[0].id;

  if (papel !== "client") {
    await pool.query("UPDATE usuarios SET role = $1, factory_name = $2 WHERE id = $3", [
      papel,
      opcoes.nomeDaFabrica ?? (papel === "factory" ? `Fabrica ${n}` : null),
      id,
    ]);
  }

  const token = await obterToken(email, SENHA_PADRAO);

  return { id, nome, email, papel, senha: SENHA_PADRAO, token };
}

/** Faz login pela API e devolve o token. Nenhuma suposição sobre o payload. */
export async function obterToken(email: string, senha: string): Promise<string> {
  const login = await request(app).post("/api/auth/login").send({ email, password: senha });

  if (login.status !== 200) {
    throw new Error(`Falha no login de teste (${login.status}): ${JSON.stringify(login.body)}`);
  }

  const token = login.body?.token ?? login.body?.data?.token;
  if (!token) {
    throw new Error(
      `Login respondeu 200 mas nenhum token foi encontrado no corpo: ${JSON.stringify(login.body)}`
    );
  }
  return token;
}

/** Açúcar para montar o header em cada requisição autenticada. */
export function comToken(token: string): [string, string] {
  return ["Authorization", `Bearer ${token}`];
}
