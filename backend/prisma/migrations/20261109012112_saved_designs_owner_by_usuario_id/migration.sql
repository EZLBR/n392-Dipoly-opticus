-- BOLA-05: o dono de um design é usuario_id, nunca o e-mail (ADR-0002).
--
-- customer_email era uma cópia do e-mail do autor, gravada na criação e
-- nunca sincronizada. Como escopo de autorização, ela fazia quem herdasse
-- um e-mail antigo herdar os designs. Nada mais a lê: o e-mail atual do
-- dono está em usuarios, pela FK de usuario_id.
--
-- Não há usuario_id a preencher: a coluna é NOT NULL, com FK para usuarios,
-- desde o primeiro schema (legado e migration init), e sempre foi gravada a
-- partir do token, junto com o e-mail. Todo registro existente já tem dono.

-- DropIndex
DROP INDEX "idx_designs_email";

-- AlterTable
ALTER TABLE "saved_designs" DROP COLUMN "customer_email";
