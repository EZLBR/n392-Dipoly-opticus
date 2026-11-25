// ============================================================
//   TIMESTAMP: pg e Prisma leem o mesmo instante
//
//   Durante a DB-03, parte dos endpoints lê pelo pg e parte pelo
//   Prisma. O processo roda aqui em America/Sao_Paulo, onde o pg,
//   sem o parser de config/pgTypes.ts, devolvia 3 horas a mais.
// ============================================================

import { afterEach, beforeEach, expect, it } from "vitest";
import pool from "../../src/config/db.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario } from "../helpers/auth.js";

let fusoOriginal: string | undefined;

beforeEach(() => {
  fusoOriginal = process.env.TZ;
  process.env.TZ = "America/Sao_Paulo";
});

afterEach(() => {
  if (fusoOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = fusoOriginal;
});

it("o criado_em lido pelo pg é o mesmo instante lido pelo Prisma", async () => {
  const usuario = await criarUsuario("client");

  const { rows: [pelaPg] } = await pool.query<{ criado_em: Date }>(
    "SELECT criado_em FROM usuarios WHERE id = $1", [usuario.id],
  );
  const pelaPrisma = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { criadoEm: true } });

  expect(pelaPg.criado_em).toBeInstanceOf(Date);
  expect(pelaPg.criado_em.getTime()).toBe(pelaPrisma.criadoEm!.getTime());
});
