// ============================================================
//   CONCILIAÇÃO DA FEAT-04 — pedidos que a migração não converteu
//   com certeza (ADR-0004)
//
//   Só lê. Lista cada pedido com o motivo:
//
//   sem_itens                   o pedido não tem item: foi gravado pela
//                               versão anterior da API depois da
//                               migration. Rodar de novo a migration
//                               20261126121000_itens_dos_pedidos_antigos
//                               (psql -f) resolve, porque ela é idempotente.
//   soma_diferente_do_total     a soma dos itens não é o total do pedido.
//   quantidade_nao_aproveitada  o pedido de um item tinha uma quantity que
//                               não virou a quantidade do item (não era
//                               inteira, ou o total não dividia em centavos
//                               exatos): o item ficou com 1 unidade pelo
//                               total.
//   especificacao_ilegivel      o custom_specs do pedido não é um objeto
//                               JSON: o item ficou com especificação vazia.
//
//   Uso, depois do deploy:
//     docker compose exec api node dist/scripts/conciliar-pedido-itens.js
//   ou, no desenvolvimento:
//     npm run conciliar:pedido-itens
//   Sai com código 1 quando há algo a conciliar.
// ============================================================

import { pathToFileURL } from "node:url";
import type { Prisma, PrismaClient } from "@prisma/client";

export type MotivoDeConciliacao =
  | "sem_itens"
  | "soma_diferente_do_total"
  | "quantidade_nao_aproveitada"
  | "especificacao_ilegivel";

export interface PedidoAConciliar {
  pedidoPublicId: string;
  motivos: MotivoDeConciliacao[];
}

/**
 * A conferência inteira roda no banco, numa consulta só. Os CASE aninhados
 * garantem que o texto só é convertido para JSON depois de conferido.
 */
export async function pedidosAConciliar(
  db: PrismaClient | Prisma.TransactionClient,
): Promise<PedidoAConciliar[]> {
  return db.$queryRaw<PedidoAConciliar[]>`
    WITH somas AS (
      SELECT p.id, p."publicId", p.total, p.custom_specs,
             COUNT(i.id)::integer AS itens,
             COALESCE(SUM(i.quantidade * i.preco_unitario), 0) AS soma,
             MIN(i.quantidade) AS quantidade
        FROM pedidos p
        LEFT JOIN pedido_itens i ON i.pedido_id = p.id
       GROUP BY p.id
    ),
    lidos AS (
      SELECT s.*,
             CASE
               WHEN s.custom_specs IS NOT NULL AND pg_input_is_valid(s.custom_specs, 'jsonb')
               THEN s.custom_specs::jsonb
             END AS documento
        FROM somas s
    ),
    motivos AS (
      SELECT l.id, l."publicId",
             array_remove(ARRAY[
               CASE WHEN l.itens = 0 THEN 'sem_itens' END,
               CASE WHEN l.itens > 0 AND l.soma <> l.total THEN 'soma_diferente_do_total' END,
               CASE
                 WHEN l.itens = 1 AND jsonb_typeof(l.documento) = 'object' AND l.documento ? 'quantity'
                 THEN CASE
                        WHEN l.documento -> 'quantity' <> to_jsonb(l.quantidade) THEN 'quantidade_nao_aproveitada'
                      END
               END,
               CASE
                 WHEN l.custom_specs IS NOT NULL AND jsonb_typeof(l.documento) IS DISTINCT FROM 'object'
                 THEN 'especificacao_ilegivel'
               END
             ], NULL) AS motivos
        FROM lidos l
    )
    SELECT m."publicId" AS "pedidoPublicId", m.motivos
      FROM motivos m
     WHERE cardinality(m.motivos) > 0
     ORDER BY m.id`;
}

async function main() {
  // Só o banco: o script não sobe a API, então não lê a configuração dela
  // (gateway, JWT, e-mail). Sem DATABASE_URL, falha ao conectar.
  const { default: dotenv } = await import("dotenv");
  dotenv.config();
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const casos = await pedidosAConciliar(prisma);
    for (const caso of casos) {
      console.log(`${caso.pedidoPublicId}\t${caso.motivos.join(", ")}`);
    }
    console.log(casos.length === 0
      ? "Nenhum pedido a conciliar."
      : `${casos.length} pedido(s) a conciliar.`);
    process.exitCode = casos.length === 0 ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 2;
  });
}
