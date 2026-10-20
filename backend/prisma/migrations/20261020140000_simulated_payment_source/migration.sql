-- A origem é uma decisão do servidor, não pode ser inferida do billingId.
-- Dados legados sem comprovação de origem permanecem não simulados.
ALTER TABLE "pedidos" ADD COLUMN "pagamento_simulado" BOOLEAN NOT NULL DEFAULT false;
