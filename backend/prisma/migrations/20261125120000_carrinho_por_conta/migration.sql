-- CART-01 (#115): carrinho persistido por conta.
CREATE TABLE "carrinho_itens" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "chave" VARCHAR(64) NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "factory_public_id" VARCHAR(64),
    "factory_name" VARCHAR(255) NOT NULL,
    "custom_specs" JSONB NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "pedido_id" INTEGER,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicId" TEXT NOT NULL DEFAULT gen_random_uuid(),
    CONSTRAINT "carrinho_itens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "carrinho_itens_quantidade" CHECK ("quantidade" BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "carrinho_itens_publicId_key" ON "carrinho_itens"("publicId");
CREATE UNIQUE INDEX "carrinho_itens_usuario_chave_key" ON "carrinho_itens"("usuario_id", "chave");
CREATE INDEX "idx_carrinho_itens_pedido" ON "carrinho_itens"("pedido_id");

ALTER TABLE "carrinho_itens" ADD CONSTRAINT "carrinho_itens_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "carrinho_itens" ADD CONSTRAINT "carrinho_itens_pedido_id_fkey"
    FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
