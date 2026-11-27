BEGIN;

-- FEAT-04 (#48), ADR-0004: cada pedido anterior vira um pedido com um item.
--
--   product_name   o do pedido
--   custom_specs   o do pedido, sem a quantity; ilegível vira {}
--   quantidade     custom_specs.quantity, quando é um inteiro positivo e o
--                  total dividido por ela dá centavos exatos
--   preco_unitario total / quantidade nesse caso; senão o item fica com
--                  quantidade 1 e preço igual ao total
--
-- Nos dois casos a soma do item é o total do pedido, que não muda. Os pedidos
-- que caíram na quantidade 1 ou na especificação ilegível são listados por
-- src/scripts/conciliar-pedido-itens.ts.
--
-- Idempotente: só cria item para pedido que ainda não tem nenhum. Pode ser
-- rodada de novo com psql -f, para algum pedido gravado pela versão anterior
-- da API durante o deploy.

-- Nenhum pedido novo entra enquanto os antigos são convertidos.
LOCK TABLE "pedidos" IN SHARE ROW EXCLUSIVE MODE;

-- Total negativo não tem preço unitário válido. Para a migration, em vez de
-- inventar um valor.
DO $$
DECLARE
    negativos TEXT;
BEGIN
    SELECT string_agg(p."id"::text, ', ' ORDER BY p."id") INTO negativos
      FROM "pedidos" p
     WHERE p."total" < 0
       AND NOT EXISTS (SELECT 1 FROM "pedido_itens" i WHERE i."pedido_id" = p."id");
    IF negativos IS NOT NULL THEN
        RAISE EXCEPTION 'pedidos com total negativo não viram item (ids %): corrija antes de migrar', negativos;
    END IF;
END;
$$;

WITH sem_itens AS (
    SELECT p."id", p."product_name", p."total",
           CASE
               WHEN p."custom_specs" IS NOT NULL AND pg_input_is_valid(p."custom_specs", 'jsonb')
               THEN CASE
                        WHEN jsonb_typeof(p."custom_specs"::jsonb) = 'object' THEN p."custom_specs"::jsonb
                        ELSE '{}'::jsonb
                    END
               ELSE '{}'::jsonb
           END AS especificacao
      FROM "pedidos" p
     WHERE NOT EXISTS (SELECT 1 FROM "pedido_itens" i WHERE i."pedido_id" = p."id")
),
com_quantidade AS (
    -- CASE aninhado: o texto só vira número depois de conferido que é número.
    SELECT s.*,
           CASE
               WHEN jsonb_typeof(s.especificacao -> 'quantity') = 'number'
               THEN CASE
                        WHEN (s.especificacao ->> 'quantity')::numeric BETWEEN 1 AND 2147483647
                         AND (s.especificacao ->> 'quantity')::numeric % 1 = 0
                        THEN (s.especificacao ->> 'quantity')::numeric
                    END
           END AS quantidade_informada
      FROM sem_itens s
),
convertidos AS (
    SELECT c.*,
           c.quantidade_informada IS NOT NULL
           AND (c."total" * 100) % c.quantidade_informada = 0 AS divisao_exata
      FROM com_quantidade c
)
INSERT INTO "pedido_itens" ("pedido_id", "product_name", "custom_specs", "quantidade", "preco_unitario")
SELECT v."id",
       v."product_name",
       v.especificacao - 'quantity',
       CASE WHEN v.divisao_exata THEN v.quantidade_informada::integer ELSE 1 END,
       CASE WHEN v.divisao_exata THEN v."total" / v.quantidade_informada ELSE v."total" END
  FROM convertidos v
 ORDER BY v."id";

COMMIT;
