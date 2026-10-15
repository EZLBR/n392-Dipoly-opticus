// ============================================================
//   STOCK CONTROLLER — Gerenciamento de Estoque
//   Rotas: /api/stock
// ============================================================

import pool from "../config/db.js";
import type { Request, Response } from "express";
import { ConflictProblem, NotFoundProblem } from "../errors/problem.js";
import { LIMITE_QUANTIDADE_ESTOQUE, type UpdateStockDTO } from "../dtos/stock/stock.dto.js";

// ─────────────────────────────────────────────────────────
//   LISTAR TODO O ESTOQUE
//   GET /api/stock
// ─────────────────────────────────────────────────────────
export async function getAllStock(req: Request, res: Response) {
  const page = parseInt(String(req.query.page || "")) || 1;
  const limit = parseInt(String(req.query.limit || "")) || 20;
  const offset = (page - 1) * limit;

  const countRes = await pool.query(`SELECT COUNT(*) FROM estoque e INNER JOIN produtos p ON p.id = e.produto_id WHERE p.ativo = TRUE`);
  const totalCount = parseInt(countRes.rows[0].count);

  const { rows } = await pool.query(
    `SELECT
      e.id,
      e.produto_id,
      p.nome          AS produto_nome,
      p.preco         AS produto_preco,
      c.nome          AS categoria_nome,
      e.quantidade,
      e.estoque_minimo,
      e.atualizado_em,
      -- Flag de alerta: estoque abaixo do mínimo
      (e.quantidade <= e.estoque_minimo) AS alerta_baixo_estoque
     FROM estoque e
     INNER JOIN produtos p ON p.id = e.produto_id
     LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE p.ativo = TRUE
     ORDER BY e.quantidade ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  // Separa os produtos com estoque crítico (desta página)
  const alertas = rows.filter(r => r.alerta_baixo_estoque);

  return res.json({
    success:  true,
    estoque:  rows,
    alertas:  alertas.length,
    produtos_criticos: alertas.map(r => r.produto_nome),
    pagination: {
      page,
      limit,
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / limit)
    }
  });
}

// ─────────────────────────────────────────────────────────
//   BUSCAR ESTOQUE DE UM PRODUTO
//   GET /api/stock/product/:produtoId
// ─────────────────────────────────────────────────────────
export async function getStockByProduct(req: Request, res: Response) {
  const { produtoId } = req.params;

  const { rows } = await pool.query(
    `SELECT e.*, p.nome AS produto_nome, p.preco
     FROM estoque e
     INNER JOIN produtos p ON p.id = e.produto_id
     WHERE e.produto_id = $1`,
    [produtoId]
  );

  if (rows.length === 0) {
    throw new NotFoundProblem("Estoque não encontrado para esse produto.");
  }

  const item = rows[0];

  return res.json({
    success: true,
    estoque: item,
    alerta:  item.quantidade <= item.estoque_minimo
  });
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR ESTOQUE
//   PUT /api/stock/product/:produtoId
//   Body: { quantidade, estoque_minimo, operacao }
//   operacao: 'set' (define valor) | 'add' (adiciona) | 'subtract' (subtrai)
// ─────────────────────────────────────────────────────────

// A operação acontece dentro do próprio UPDATE, sobre o valor atual da
// linha. Ler a quantidade, calcular em JavaScript e gravar o valor
// absoluto perdia baixas concorrentes: duas baixas de 5 sobre um estoque
// de 10 terminavam em 5, não em 0. A guarda no WHERE impede estoque
// negativo e estouro do INTEGER; quando ela barra a escrita, nenhuma
// linha é afetada.
const OPERACOES_DE_ESTOQUE = {
  set:      { novaQuantidade: "$1",              guarda: "TRUE" },
  add:      { novaQuantidade: "quantidade + $1", guarda: `quantidade <= ${LIMITE_QUANTIDADE_ESTOQUE} - $1` },
  subtract: { novaQuantidade: "quantidade - $1", guarda: "quantidade >= $1" },
} as const;

export async function updateStock(req: Request, res: Response) {
  const { produtoId } = req.params;
  const { quantidade, estoque_minimo, operacao } = req.body as UpdateStockDTO;
  const { novaQuantidade, guarda } = OPERACOES_DE_ESTOQUE[operacao];

  const { rows: atualizados } = await pool.query(
    `WITH atualizado AS (
       UPDATE estoque
          SET quantidade     = ${novaQuantidade},
              estoque_minimo = COALESCE($2, estoque_minimo),
              version        = version + 1
        WHERE produto_id = $3 AND ${guarda}
       RETURNING *
     )
     SELECT a.*, p.nome AS produto_nome
       FROM atualizado a
       INNER JOIN produtos p ON p.id = a.produto_id`,
    [quantidade, estoque_minimo ?? null, produtoId]
  );

  if (atualizados.length === 0) {
    // O UPDATE já decidiu, de forma atômica. Esta leitura serve só para
    // escolher a resposta: produto inexistente ou guarda que barrou.
    const { rows: atual } = await pool.query<{ quantidade: number }>(
      "SELECT quantidade FROM estoque WHERE produto_id = $1",
      [produtoId]
    );

    if (atual.length === 0) {
      throw new NotFoundProblem("Produto não encontrado no estoque.");
    }
    if (operacao === "subtract") {
      throw new ConflictProblem(`Estoque insuficiente. Disponível: ${atual[0].quantidade} unidades.`);
    }
    throw new ConflictProblem(`A entrada excederia o limite de ${LIMITE_QUANTIDADE_ESTOQUE} unidades em estoque.`);
  }

  const item = atualizados[0];
  const alerta = item.quantidade <= item.estoque_minimo;

  return res.json({
    success: true,
    estoque: item,
    alerta,
    message: alerta
      ? `⚠️ Atenção: estoque baixo! ${item.quantidade} unidades (mínimo: ${item.estoque_minimo})`
      : `Estoque atualizado: ${item.quantidade} unidades disponíveis.`
  });
}

// ─────────────────────────────────────────────────────────
//   ALERTAS DE ESTOQUE BAIXO
//   GET /api/stock/alerts
// ─────────────────────────────────────────────────────────
export async function getStockAlerts(req: Request, res: Response) {
  const { rows } = await pool.query(
    `SELECT
      e.produto_id,
      p.nome         AS produto_nome,
      e.quantidade,
      e.estoque_minimo,
      (e.estoque_minimo - e.quantidade) AS deficit
     FROM estoque e
     INNER JOIN produtos p ON p.id = e.produto_id
     WHERE e.quantidade <= e.estoque_minimo AND p.ativo = TRUE
     ORDER BY deficit DESC`
  );

  return res.json({
    success: true,
    alertas: rows,
    total:   rows.length
  });
}