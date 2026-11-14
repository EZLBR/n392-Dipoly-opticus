-- ID-01: publicId UUIDv4 nos modelos expostos que ainda não tinham.
--
-- usuarios, produtos, pedidos e saved_designs já têm publicId desde a
-- migration init. Faltavam as tabelas cujo id inteiro aparece em rotas ou
-- respostas da API: categorias (/api/categories/:id), estoque (GET
-- /api/stock) e pagamentos (GET /api/payments). A troca das rotas e DTOs
-- para publicId é a ID-02; o id inteiro continua como chave interna e
-- estrangeira.
--
-- O default gen_random_uuid() é volátil: no ADD COLUMN o PostgreSQL o avalia
-- para cada linha existente, então os registros atuais recebem UUIDs v4
-- distintos e a coluna já nasce NOT NULL, sem passo de preenchimento à parte.
-- Os INSERTs em SQL puro não informam publicId e dependem desse default.

-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "publicId" TEXT NOT NULL DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "estoque" ADD COLUMN     "publicId" TEXT NOT NULL DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "pagamentos" ADD COLUMN     "publicId" TEXT NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex
CREATE UNIQUE INDEX "categorias_publicId_key" ON "categorias"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "estoque_publicId_key" ON "estoque"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_publicId_key" ON "pagamentos"("publicId");
