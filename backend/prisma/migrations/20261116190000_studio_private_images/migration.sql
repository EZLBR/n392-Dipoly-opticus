CREATE TABLE "studio_assets" (
    "id" UUID NOT NULL,
    "usuario_id" INTEGER,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "studio_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "studio_assets_dimensions" CHECK ("width" BETWEEN 1 AND 4096 AND "height" BETWEEN 1 AND 4096),
    CONSTRAINT "studio_assets_bytes" CHECK ("bytes" BETWEEN 1 AND 5242880),
    CONSTRAINT "studio_assets_state" CHECK ("state" IN ('pending', 'ready', 'deleting'))
);

CREATE TABLE "studio_design_assets" (
    "design_id" VARCHAR(255) NOT NULL,
    "asset_id" UUID NOT NULL,
    CONSTRAINT "studio_design_assets_pkey" PRIMARY KEY ("design_id", "asset_id")
);

CREATE INDEX "studio_assets_usuario_id_idx" ON "studio_assets"("usuario_id");
CREATE INDEX "studio_design_assets_asset_id_idx" ON "studio_design_assets"("asset_id");

ALTER TABLE "studio_assets" ADD CONSTRAINT "studio_assets_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "studio_design_assets" ADD CONSTRAINT "studio_design_assets_design_id_fkey"
    FOREIGN KEY ("design_id") REFERENCES "saved_designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studio_design_assets" ADD CONSTRAINT "studio_design_assets_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "studio_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
