ALTER TABLE "usuarios"
  ADD COLUMN "reset_token_hash" VARCHAR(64),
  ADD COLUMN "reset_token_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "usuarios_reset_token_hash_key" ON "usuarios"("reset_token_hash");
