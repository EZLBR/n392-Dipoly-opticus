BEGIN;

-- FEAT-04 (#48), ADR-0004: pedido_itens passa a guardar cada item comprado,
-- com o nome, a especificação e o preço do momento da compra.
--
-- Até aqui nenhum código gravava nela. Uma linha existente veio de fora do
-- sistema e não tem como virar o formato novo: a migration para, em vez de
-- apagar ou adivinhar (o ADR pede essa conferência no banco publicado).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "pedido_itens") THEN
        RAISE EXCEPTION 'pedido_itens deveria estar vazia (ADR-0004): confira as linhas antes de migrar';
    END IF;
END;
$$;

-- Item do Studio não está no catálogo: o produto fica opcional. O nome e a
-- especificação ficam no próprio item, então apagar o produto do catálogo
-- não apaga nem bloqueia o histórico do pedido.
ALTER TABLE "pedido_itens" DROP CONSTRAINT "pedido_itens_produto_id_fkey";
ALTER TABLE "pedido_itens" ALTER COLUMN "produto_id" DROP NOT NULL;
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produto_id_fkey"
    FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A quantidade é sempre informada por quem grava: o default 1 esconderia um
-- item gravado sem ela.
ALTER TABLE "pedido_itens" ALTER COLUMN "quantidade" DROP DEFAULT;

-- A tabela está vazia (conferido acima), então as colunas novas nascem
-- obrigatórias sem precisar de default.
ALTER TABLE "pedido_itens"
    ADD COLUMN "product_name" VARCHAR(255) NOT NULL,
    ADD COLUMN "custom_specs" JSONB NOT NULL,
    ADD COLUMN "publicId" TEXT NOT NULL DEFAULT gen_random_uuid(),
    ADD CONSTRAINT "pedido_itens_quantidade" CHECK ("quantidade" > 0),
    ADD CONSTRAINT "pedido_itens_preco_unitario" CHECK ("preco_unitario" >= 0);

CREATE UNIQUE INDEX "pedido_itens_publicId_key" ON "pedido_itens"("publicId");

COMMIT;
