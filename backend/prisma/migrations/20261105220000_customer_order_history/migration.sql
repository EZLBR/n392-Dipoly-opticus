BEGIN;

-- Keep the baseline and the first tracked writes in the same migration window.
LOCK TABLE "pedidos" IN SHARE ROW EXCLUSIVE MODE;

CREATE TYPE "OrderHistoryKind" AS ENUM ('baseline', 'created', 'transition');

CREATE TABLE "order_status_history" (
    "id" BIGSERIAL PRIMARY KEY,
    "order_id" INTEGER NOT NULL REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "kind" "OrderHistoryKind" NOT NULL,
    "from_status" "PedidoStatus",
    "to_status" "PedidoStatus",
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_order_status_history_order_id" ON "order_status_history" ("order_id", "id");

INSERT INTO "order_status_history" ("order_id", "kind", "to_status")
SELECT "id", 'baseline', "status" FROM "pedidos";

CREATE FUNCTION record_order_status_history() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO "order_status_history" ("order_id", "kind", "to_status", "occurred_at")
        VALUES (NEW."id", 'created', NEW."status", clock_timestamp());
    ELSIF OLD."status" IS DISTINCT FROM NEW."status" THEN
        INSERT INTO "order_status_history" ("order_id", "kind", "from_status", "to_status", "occurred_at")
        VALUES (NEW."id", 'transition', OLD."status", NEW."status", clock_timestamp());
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER order_status_history_trigger
AFTER INSERT OR UPDATE OF "status" ON "pedidos"
FOR EACH ROW EXECUTE FUNCTION record_order_status_history();

COMMIT;
