// ============================================================
//   ID-01 — publicId UUIDv4 nos modelos expostos
//
//   Toda tabela cujo id aparece em rota ou resposta da API tem uma
//   coluna publicId UUIDv4, única, indexada e gerada pelo banco. O id
//   inteiro continua como chave primária e alvo das chaves estrangeiras
//   (a troca das rotas e DTOs é a ID-02).
//
//   A migration que adicionou a coluna a categorias, estoque e
//   pagamentos é reexecutada aqui, numa transação desfeita no final,
//   sobre linhas que já existiam: é a garantia de que o deploy preenche
//   os registros atuais.
// ============================================================

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const TABELAS_EXPOSTAS = ["usuarios", "produtos", "pedidos", "saved_designs", "categorias", "estoque", "pagamentos"];
const TABELAS_DA_MIGRATION = ["categorias", "estoque", "pagamentos"];

const MIGRATION = new URL(
  "../../prisma/migrations/20261114120000_public_id_categorias_estoque_pagamentos/migration.sql",
  import.meta.url,
);

describe("ID-01: schema do publicId", () => {
  it.each(TABELAS_EXPOSTAS)("%s.publicId é NOT NULL, gerado pelo banco e com índice único", async tabela => {
    const { rows: [coluna] } = await pool.query<{ is_nullable: string; column_default: string | null; data_type: string }>(
      `SELECT is_nullable, column_default, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'publicId'`,
      [tabela],
    );
    expect(coluna).toBeDefined();
    expect(coluna.is_nullable).toBe("NO");
    expect(coluna.column_default).toMatch(/gen_random_uuid\(\)/);

    const { rows: indices } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`,
      [tabela],
    );
    expect(indices.map(i => i.indexdef)).toContainEqual(
      expect.stringMatching(/^CREATE UNIQUE INDEX .* USING btree \("publicId"\)$/),
    );
  });

  it.each(TABELAS_DA_MIGRATION)("%s mantém o id inteiro como chave primária", async tabela => {
    const { rows } = await pool.query<{ coluna: string; tipo: string }>(
      `SELECT a.attname AS coluna, format_type(a.atttypid, a.atttypmod) AS tipo
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary`,
      [tabela],
    );
    expect(rows).toEqual([{ coluna: "id", tipo: "integer" }]);
  });

  it("as chaves estrangeiras continuam apontando para o id inteiro", async () => {
    const { rows } = await pool.query<{ definicao: string }>(
      `SELECT pg_get_constraintdef(oid) AS definicao FROM pg_constraint
        WHERE contype = 'f' AND conrelid IN ('produtos'::regclass, 'estoque'::regclass, 'pagamentos'::regclass)`,
    );
    const definicoes = rows.map(r => r.definicao);
    expect(definicoes).toContainEqual(expect.stringMatching(/FOREIGN KEY \(categoria_id\) REFERENCES categorias\(id\)/));
    expect(definicoes).toContainEqual(expect.stringMatching(/FOREIGN KEY \(produto_id\) REFERENCES produtos\(id\)/));
    expect(definicoes).toContainEqual(expect.stringMatching(/FOREIGN KEY \(pedido_id\) REFERENCES pedidos\(id\)/));
    expect(definicoes.join("\n")).not.toMatch(/REFERENCES \w+\("publicId"\)/);
  });
});

describe("ID-01: geração do publicId", () => {
  it("uma categoria criada pela API recebe um UUIDv4", async () => {
    const staff = await criarUsuario("staff");
    const res = await request(app)
      .post("/api/categories")
      .set(...comToken(staff.token))
      .send({ nome: "Categoria ID-01" });
    expect(res.status).toBe(201);

    const { rows: [categoria] } = await pool.query<{ publicId: string }>(
      `SELECT "publicId" FROM categorias WHERE nome = $1`,
      ["Categoria ID-01"],
    );
    expect(categoria.publicId).toMatch(UUID_V4);
  });

  it("INSERTs em SQL puro, sem informar publicId, recebem UUIDv4 distintos", async () => {
    const { rows: [usuario] } = await pool.query<{ id: number }>(
      `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Dono', 'dono-id01@exemplo.invalid', 'x') RETURNING id`,
    );
    const { rows: [produto] } = await pool.query<{ id: number }>(
      `INSERT INTO produtos (nome, preco) VALUES ('Armação', 100) RETURNING id`,
    );
    const { rows: [pedido] } = await pool.query<{ id: number }>(
      `INSERT INTO pedidos (usuario_id, customer_name, customer_email, product_name, total)
       VALUES ($1, 'Dono', 'dono-id01@exemplo.invalid', 'Armação', 100) RETURNING id`,
      [usuario.id],
    );
    const { rows: estoque } = await pool.query<{ publicId: string }>(
      `INSERT INTO estoque (produto_id) VALUES ($1) RETURNING "publicId"`,
      [produto.id],
    );
    const { rows: pagamentos } = await pool.query<{ publicId: string }>(
      `INSERT INTO pagamentos (pedido_id, valor) VALUES ($1, 100), ($1, 100) RETURNING "publicId"`,
      [pedido.id],
    );

    const gerados = [...estoque, ...pagamentos].map(r => r.publicId);
    gerados.forEach(publicId => expect(publicId).toMatch(UUID_V4));
    expect(new Set(gerados).size).toBe(gerados.length);
  });
});

describe("ID-01: migration preenche os registros existentes", () => {
  it("adiciona publicId UUIDv4 distinto a cada linha que já existia", async () => {
    const sql = await readFile(MIGRATION, "utf8");
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");

      // Estado anterior à migration: as três tabelas ainda sem publicId.
      for (const tabela of TABELAS_DA_MIGRATION) {
        await cliente.query(`ALTER TABLE ${tabela} DROP COLUMN "publicId"`);
      }

      const { rows: [usuario] } = await cliente.query<{ id: number }>(
        `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Legado', 'legado-id01@exemplo.invalid', 'x') RETURNING id`,
      );
      await cliente.query(`INSERT INTO categorias (nome) VALUES ('Legado A'), ('Legado B'), ('Legado C')`);
      const { rows: produtos } = await cliente.query<{ id: number }>(
        `INSERT INTO produtos (nome, preco) VALUES ('P1', 10), ('P2', 20) RETURNING id`,
      );
      await cliente.query(`INSERT INTO estoque (produto_id) VALUES ($1), ($2)`, [produtos[0].id, produtos[1].id]);
      const { rows: [pedido] } = await cliente.query<{ id: number }>(
        `INSERT INTO pedidos (usuario_id, customer_name, customer_email, product_name, total)
         VALUES ($1, 'Legado', 'legado-id01@exemplo.invalid', 'P1', 10) RETURNING id`,
        [usuario.id],
      );
      await cliente.query(`INSERT INTO pagamentos (pedido_id, valor) VALUES ($1, 10), ($1, 10), ($1, 10)`, [pedido.id]);

      await cliente.query(sql);

      for (const tabela of TABELAS_DA_MIGRATION) {
        const { rows } = await cliente.query<{ publicId: string }>(`SELECT "publicId" FROM ${tabela}`);
        expect(rows.length, tabela).toBeGreaterThan(1);
        rows.forEach(({ publicId }) => expect(publicId, tabela).toMatch(UUID_V4));
        expect(new Set(rows.map(r => r.publicId)).size, tabela).toBe(rows.length);
      }
    } finally {
      await cliente.query("ROLLBACK");
      cliente.release();
    }

    // O ROLLBACK devolve o schema migrado intacto para os demais testes.
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'publicId' AND table_name = ANY($1)`,
      [TABELAS_DA_MIGRATION],
    );
    expect(rows).toHaveLength(TABELAS_DA_MIGRATION.length);
  });
});
