BEGIN;

-- CONC-02: toda escrita em pedidos avança a versão, por qualquer caminho
-- (Prisma, SQL puro do webhook, da cobrança e do checkout). A trava
-- otimista da rota de status compara essa coluna com a versão que o
-- cliente leu. Partir de OLD ignora o valor enviado pelo UPDATE, então
-- um incremento manual no código não conta duas vezes.
CREATE FUNCTION avancar_versao_do_pedido() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
    NEW."version" := OLD."version" + 1;
    RETURN NEW;
END;
$$;

CREATE TRIGGER pedidos_version_trigger
BEFORE UPDATE ON "pedidos"
FOR EACH ROW EXECUTE FUNCTION avancar_versao_do_pedido();

COMMIT;
