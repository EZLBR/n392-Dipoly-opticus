// ============================================================
//   TEST-03 — RBAC por rota e ciclo de vida do token
//
//   Os testes unitários do routerGuard cobrem o middleware isolado.
//   Aqui a cobertura é pela API montada: cada rota com restrição de
//   papel é chamada com papéis permitidos e negados, e cada rota
//   autenticada é chamada sem header, com token expirado, com
//   assinatura inválida e com token forjado sem assinatura.
//
//   Recursos inexistentes são usados de propósito: um papel negado
//   recebe 403 antes do handler (que responderia 404 ou 400), o que
//   prova que o guard roda antes de qualquer acesso a dados.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../setup/app.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario, comToken, type Papel, type UsuarioDeTeste } from "../helpers/auth.js";
import { esperarProblema } from "../helpers/problem.js";

type Metodo = "get" | "post" | "put" | "delete";

interface Rota {
  metodo: Metodo;
  caminho: string;
  corpo?: Record<string, unknown>;
}

interface RotaComPapel extends Rota {
  permitidos: Papel[];
}

const PAPEIS: Papel[] = ["client", "factory", "staff"];
const ID_INEXISTENTE = 2_147_483_000;
const UUID_INEXISTENTE = "6f1c2a4e-1b2d-4c3e-9f4a-5b6c7d8e9f00";

// Toda rota da API que restringe papel (routerGuard com papéis).
const ROTAS_COM_PAPEL: RotaComPapel[] = [
  { metodo: "get",    caminho: "/api/auth/users",                              permitidos: ["staff"] },
  { metodo: "put",    caminho: `/api/auth/users/${ID_INEXISTENTE}`,            permitidos: ["staff"], corpo: {} },
  { metodo: "delete", caminho: `/api/auth/users/${ID_INEXISTENTE}`,            permitidos: ["staff"] },
  { metodo: "post",   caminho: "/api/categories",                              permitidos: ["staff"], corpo: {} },
  { metodo: "put",    caminho: `/api/categories/${ID_INEXISTENTE}`,            permitidos: ["staff"], corpo: {} },
  { metodo: "delete", caminho: `/api/categories/${ID_INEXISTENTE}`,            permitidos: ["staff"] },
  { metodo: "post",   caminho: "/api/products",                                permitidos: ["staff"], corpo: {} },
  { metodo: "put",    caminho: `/api/products/${ID_INEXISTENTE}`,              permitidos: ["staff"], corpo: {} },
  { metodo: "delete", caminho: `/api/products/${ID_INEXISTENTE}`,              permitidos: ["staff"] },
  { metodo: "get",    caminho: "/api/stock",                                   permitidos: ["staff", "factory"] },
  { metodo: "get",    caminho: "/api/stock/alerts",                            permitidos: ["staff", "factory"] },
  { metodo: "get",    caminho: `/api/stock/product/${ID_INEXISTENTE}`,         permitidos: ["staff", "factory"] },
  { metodo: "put",    caminho: `/api/stock/product/${ID_INEXISTENTE}`,         permitidos: ["staff"], corpo: {} },
  { metodo: "get",    caminho: "/api/payments",                                permitidos: ["staff"] },
  { metodo: "get",    caminho: "/api/orders/mine",                             permitidos: ["client"] },
  { metodo: "get",    caminho: `/api/orders/mine/${UUID_INEXISTENTE}`,         permitidos: ["client"] },
];

// Rotas que exigem apenas autenticação, sem restringir papel.
const ROTAS_AUTENTICADAS: Rota[] = [
  { metodo: "get",    caminho: "/api/auth/me" },
  { metodo: "get",    caminho: "/api/designs" },
  { metodo: "post",   caminho: "/api/designs", corpo: {} },
  { metodo: "put",    caminho: `/api/designs/${UUID_INEXISTENTE}`, corpo: {} },
  { metodo: "delete", caminho: `/api/designs/${UUID_INEXISTENTE}` },
  { metodo: "get",    caminho: "/api/orders" },
  { metodo: "post",   caminho: "/api/orders", corpo: {} },
  { metodo: "post",   caminho: "/api/orders/checkout-cart", corpo: {} },
  { metodo: "put",    caminho: `/api/orders/${UUID_INEXISTENTE}/status`, corpo: {} },
  { metodo: "post",   caminho: "/api/payments/create-billing", corpo: {} },
];

const TODAS_AS_ROTAS_PROTEGIDAS: Rota[] = [...ROTAS_COM_PAPEL, ...ROTAS_AUTENTICADAS];

const descrever = (rota: Rota) => `${rota.metodo.toUpperCase()} ${rota.caminho}`;

function chamar(rota: Rota, header?: [string, string]) {
  let req = request(app)[rota.metodo](rota.caminho);
  if (header) req = req.set(...header);
  return rota.corpo ? req.send(rota.corpo) : req;
}

function segredo(): string {
  const valor = process.env.JWT_SECRET;
  if (!valor) throw new Error("JWT_SECRET ausente no ambiente de teste.");
  return valor;
}

/** Payload no mesmo formato emitido pelo AuthService, com o papel mais privilegiado. */
const PAYLOAD_STAFF = { id: 1, name: "Staff", email: "staff@exemplo.invalid", role: "staff", factoryName: null };

function base64url(valor: unknown): string {
  return Buffer.from(JSON.stringify(valor)).toString("base64url");
}

const TOKENS_INVALIDOS: [string, () => string][] = [
  ["expirado", () => jwt.sign(PAYLOAD_STAFF, segredo(), { expiresIn: "-1s" })],
  ["com assinatura inválida", () => jwt.sign(PAYLOAD_STAFF, `${segredo()}-errado`, { expiresIn: "1h" })],
  ["forjado com alg none", () => `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ ...PAYLOAD_STAFF, exp: Math.floor(Date.now() / 1000) + 3600 })}.`],
  ["malformado", () => "nao-e-um-jwt"],
];

describe("TEST-03: RBAC por rota", () => {
  let usuarios: Record<Papel, UsuarioDeTeste>;

  beforeEach(async () => {
    const [client, factory, staff] = await Promise.all(PAPEIS.map(papel => criarUsuario(papel)));
    usuarios = { client, factory, staff };
  });

  it.each(ROTAS_COM_PAPEL.map(rota => [descrever(rota), rota] as const))(
    "%s aceita os papéis permitidos e nega os demais com 403",
    async (_nome, rota) => {
      for (const papel of PAPEIS) {
        const res = await chamar(rota, comToken(usuarios[papel].token));
        if (rota.permitidos.includes(papel)) {
          // Passou pelo guard: o handler ou a validação respondem, nunca 401/403.
          expect([401, 403], `${papel} deveria acessar ${descrever(rota)}`).not.toContain(res.status);
          expect(res.status, `${papel} em ${descrever(rota)}`).toBeLessThan(500);
        } else {
          esperarProblema(res, 403, "forbidden");
        }
      }
    },
  );

  it("o papel vem do token emitido no login, não de um cabeçalho ou corpo enviado pelo cliente", async () => {
    const res = await request(app)
      .get("/api/auth/users")
      .set(...comToken(usuarios.client.token))
      .set("X-User-Role", "staff")
      .query({ role: "staff" });
    esperarProblema(res, 403, "forbidden");
  });
});

describe("TEST-03: ciclo de vida do token", () => {
  it.each(TODAS_AS_ROTAS_PROTEGIDAS.map(rota => [descrever(rota), rota] as const))(
    "%s exige token válido",
    async (_nome, rota) => {
      esperarProblema(await chamar(rota), 401, "unauthorized");
      esperarProblema(await chamar(rota, ["Authorization", "Basic c3RhZmY6c2VuaGE="]), 401, "unauthorized");
      esperarProblema(await chamar(rota, ["Authorization", "Bearer "]), 401, "unauthorized");

      for (const [descricao, gerar] of TOKENS_INVALIDOS) {
        const res = await chamar(rota, comToken(gerar()));
        expect(res.status, `token ${descricao}`).toBe(401);
        esperarProblema(res, 401, "unauthorized");
      }
    },
  );

  it("um token que expira deixa de ser aceito, mesmo sendo do próprio usuário", async () => {
    const usuario = await criarUsuario("staff");
    const atual = jwt.decode(usuario.token) as jwt.JwtPayload;
    const { iat: _iat, exp: _exp, ...payload } = atual;

    const valido = jwt.sign(payload, segredo(), { expiresIn: "1h" });
    const expirado = jwt.sign(payload, segredo(), { expiresIn: "-1s" });

    expect((await request(app).get("/api/auth/users").set(...comToken(valido))).status).toBe(200);
    esperarProblema(await request(app).get("/api/auth/users").set(...comToken(expirado)), 401, "unauthorized");
  });

  it("o token emitido no login tem expiração", async () => {
    const usuario = await criarUsuario();
    const payload = jwt.decode(usuario.token) as jwt.JwtPayload;
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp! * 1000).toBeGreaterThan(Date.now());
  });
});

describe("TEST-03: cadastro público", () => {
  it.each(["staff", "factory"])("não cria conta %s, mesmo pedindo o papel no corpo", async papel => {
    const email = `escalada-${papel}-${Date.now()}@exemplo.invalid`;
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Tentativa", email, password: "SenhaTeste123", role: papel, factoryName: "Fábrica Falsa" });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("client");
    expect(res.body.user.factoryName ?? null).toBeNull();
    expect((jwt.decode(res.body.token) as jwt.JwtPayload).role).toBe("client");

    const salvo = await prisma.usuario.findUnique({ where: { email } });
    expect(salvo?.role).toBe("client");
    expect(salvo?.factoryName ?? null).toBeNull();

    // O token devolvido no cadastro não abre rotas do papel pedido.
    esperarProblema(
      await request(app).get(papel === "staff" ? "/api/auth/users" : "/api/stock").set(...comToken(res.body.token)),
      403,
      "forbidden",
    );
  });
});
