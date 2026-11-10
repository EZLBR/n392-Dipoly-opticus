// ============================================================
//   DB-04 — Schema único, criado só pelas migrations
//
//   A suíte começa de um banco vazio, montado pelo `prisma migrate
//   deploy` do global-setup. É exatamente o caso "banco novo do zero".
//
//   O publicId das quatro tabelas expostas é gerado pelo banco, e os
//   INSERTs em SQL puro (salvar design, criar pedido e produto)
//   dependem disso. O schema.prisma declarava a geração no cliente
//   (`@default(uuid())`): a próxima migration gerada a partir dele
//   removeria o default, e salvar um design passaria a falhar. O CI
//   confere schema.prisma contra as migrations; este teste confere o
//   banco que as migrations criam.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { pool } from "../setup/db.js";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function coluna(tabela: string, nome: string) {
  const { rows } = await pool.query<{ data_type: string; column_default: string | null }>(
    `SELECT data_type, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tabela, nome],
  );
  return rows[0];
}

describe("schema criado pelas migrations (DB-04)", () => {
  it.each(["usuarios", "produtos", "pedidos", "saved_designs"])(
    "%s.publicId é gerado pelo banco",
    async (tabela) => {
      expect((await coluna(tabela, "publicId")).column_default).toMatch(/gen_random_uuid\(\)/);
    },
  );

  // BOLA-05: a autoria é só usuario_id, obrigatório e ligado a usuarios.
  // O e-mail, mutável, não fica mais copiado no design.
  it("saved_designs identifica o dono só por usuario_id, NOT NULL e com FK para usuarios", async () => {
    const { rows: colunas } = await pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'saved_designs'`,
    );
    expect(colunas.map((c) => c.column_name)).not.toContain("customer_email");
    expect(colunas.find((c) => c.column_name === "usuario_id")?.is_nullable).toBe("NO");

    const { rows: fks } = await pool.query<{ definicao: string }>(
      `SELECT pg_get_constraintdef(oid) AS definicao FROM pg_constraint
        WHERE conrelid = 'saved_designs'::regclass AND contype = 'f'`,
    );
    expect(fks.map((f) => f.definicao)).toContainEqual(expect.stringMatching(/FOREIGN KEY \(usuario_id\) REFERENCES usuarios\(id\)/));
  });

  // Textual para caber o UUID gerado pelo servidor (BOLA-04) e os ids
  // legados que o Studio enviava ("design-<timestamp>").
  it("saved_designs tem chave primária textual", async () => {
    expect((await coluna("saved_designs", "id")).data_type).toBe("character varying");
  });

  it("salvar e listar um design pela API funciona num banco criado só pelas migrations", async () => {
    const cliente = await criarUsuario("client");

    const salvo = await request(app)
      .post("/api/designs")
      .set(...comToken(cliente.token))
      .send({ name: "Meu design", model: "wayfarer_front_wayfarer_temples", color: "#112233" });

    expect(salvo.status).toBe(201);
    const { rows } = await pool.query<{ publicId: string }>(
      `SELECT "publicId" FROM saved_designs WHERE id = $1`,
      [salvo.body.id],
    );
    expect(rows[0].publicId).toMatch(UUID);

    const lista = await request(app).get("/api/designs").set(...comToken(cliente.token));
    expect(lista.status).toBe(200);
    expect(lista.body.designs.map((d: { id: string }) => d.id)).toContain(salvo.body.id);
  });
});
