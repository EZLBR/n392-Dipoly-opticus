-- CreateEnum
CREATE TYPE "Role" AS ENUM ('client', 'factory', 'staff');

-- CreateEnum
CREATE TYPE "PedidoStatus" AS ENUM ('Pending Payment', 'Queued', 'In production', 'Delivered', 'Cancelled');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('pix', 'cartao_credito', 'boleto');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('pendente', 'aprovado', 'recusado', 'estornado');

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "descricao" TEXT,
    "criado_em" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "role" "Role" DEFAULT 'client',
    "factory_name" VARCHAR(255),
    "criado_em" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "publicId" TEXT NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "descricao" TEXT,
    "preco" DECIMAL(10,2) NOT NULL,
    "categoria_id" INTEGER,
    "imagem_url" VARCHAR(500),
    "ativo" BOOLEAN DEFAULT true,
    "criado_em" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "publicId" TEXT NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "customer_name" VARCHAR(255) NOT NULL,
    "customer_email" VARCHAR(255) NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "factory_id" INTEGER,
    "factory_name" VARCHAR(255),
    "status" "PedidoStatus" DEFAULT 'Pending Payment',
    "total" DECIMAL(10,2) NOT NULL,
    "custom_specs" TEXT,
    "abacate_billing_id" VARCHAR(255),
    "criado_em" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    "publicId" TEXT NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_itens" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "preco_unitario" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "pedido_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoque" (
    "id" SERIAL NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "estoque_minimo" INTEGER DEFAULT 5,
    "atualizado_em" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "metodo" "MetodoPagamento" DEFAULT 'pix',
    "status" "StatusPagamento" DEFAULT 'pendente',
    "valor" DECIMAL(10,2) NOT NULL,
    "referencia_externa" VARCHAR(255),
    "criado_em" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_designs" (
    "id" VARCHAR(255) NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "customer_email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "model" VARCHAR(255) NOT NULL,
    "color" VARCHAR(50) NOT NULL,
    "is_sunglasses" BOOLEAN DEFAULT false,
    "anti_reflective" BOOLEAN DEFAULT false,
    "temple_style" VARCHAR(50) DEFAULT 'standard',
    "top_bar" BOOLEAN DEFAULT false,
    "bridge_style" VARCHAR(50) DEFAULT 'keyhole',
    "frame_profile" VARCHAR(50) DEFAULT 'medium',
    "temple_open" DECIMAL(4,2) DEFAULT 0.00,
    "published" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "publicId" TEXT NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "saved_designs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_key" ON "categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_publicId_key" ON "usuarios"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_publicId_key" ON "produtos"("publicId");

-- CreateIndex
CREATE INDEX "idx_produtos_categoria" ON "produtos"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_publicId_key" ON "pedidos"("publicId");

-- CreateIndex
CREATE INDEX "idx_pedidos_usuario" ON "pedidos"("usuario_id");

-- CreateIndex
CREATE INDEX "idx_pedidos_factory" ON "pedidos"("factory_id");

-- CreateIndex
CREATE INDEX "idx_pedidos_status" ON "pedidos"("status");

-- CreateIndex
CREATE INDEX "idx_pedidos_billing" ON "pedidos"("abacate_billing_id");

-- CreateIndex
CREATE INDEX "idx_itens_pedido" ON "pedido_itens"("pedido_id");

-- CreateIndex
CREATE INDEX "idx_itens_produto" ON "pedido_itens"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "estoque_produto_id_key" ON "estoque"("produto_id");

-- CreateIndex
CREATE INDEX "idx_pagamentos_pedido" ON "pagamentos"("pedido_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_designs_publicId_key" ON "saved_designs"("publicId");

-- CreateIndex
CREATE INDEX "idx_designs_usuario" ON "saved_designs"("usuario_id");

-- CreateIndex
CREATE INDEX "idx_designs_email" ON "saved_designs"("customer_email");

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque" ADD CONSTRAINT "estoque_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_designs" ADD CONSTRAINT "saved_designs_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
