// ============================================================
//   CONC-03 — A conexão da transação sempre volta ao pool
//
//   O checkout liberava a conexão só no catch e depois dele. Se o
//   ROLLBACK lançasse, o release nunca rodava: a conexão vazava, e o
//   pool, de 10, travava a API depois de 10 falhas. Os testes usam o
//   pool real da aplicação e simulam a falha do ROLLBACK numa conexão
//   de verdade.
//
//   DB-03: o checkout passou para o Prisma, que devolve as próprias
//   conexões. O caso de ponta a ponta usa a confirmação do pagamento
//   simulado, que continua no emTransacao.
// ============================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import type { PoolClient } from "pg";
import pool from "../../src/config/db.js";
import { emTransacao } from "../../src/config/transacao.js";
import logger from "../../src/utils/logger.js";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido } from "../helpers/orders.js";
import { criarCobranca } from "../helpers/payments.js";
import { esperarProblema } from "../helpers/problem.js";

const LIMITE_DO_POOL = 10;

type ConexaoEspionada = { release: ReturnType<typeof vi.fn> };

/**
 * Entrega às transações (pool.connect() com promise) conexões cujo ROLLBACK
 * falha, e guarda o que cada uma recebeu no release. O pool.query interno do
 * pg usa pool.connect(callback) e segue intacto.
 */
function quebrarRollback() {
  const conectar = pool.connect.bind(pool) as (...args: unknown[]) => Promise<PoolClient>;
  const conexoes: ConexaoEspionada[] = [];
  vi.spyOn(pool, "connect").mockImplementation(((...args: unknown[]) => {
    if (typeof args[0] === "function") return conectar(...args);
    return conectar().then((conexao) => {
      const consultar = conexao.query.bind(conexao) as (...a: unknown[]) => unknown;
      (conexao as unknown as { query: unknown }).query = (...a: unknown[]) =>
        String(a[0]).trim() === "ROLLBACK" ? Promise.reject(new Error("ROLLBACK falhou (simulado)")) : consultar(...a);
      const liberar = conexao.release.bind(conexao);
      const release = vi.fn((erro?: Error | boolean) => liberar(erro));
      (conexao as unknown as { release: unknown }).release = release;
      conexoes.push({ release });
      return conexao;
    });
  }) as never);
  return conexoes;
}

const contarCategorias = async (nome: string) =>
  Number((await pool.query("SELECT COUNT(*) FROM categorias WHERE nome = $1", [nome])).rows[0].count);

afterEach(() => vi.restoreAllMocks());

describe("emTransacao (CONC-03)", () => {
  it("faz COMMIT quando o trabalho termina e devolve o resultado", async () => {
    const resultado = await emTransacao(async (conexao) => {
      await conexao.query("INSERT INTO categorias (nome) VALUES ($1)", ["Confirmada"]);
      return "pronto";
    });

    expect(resultado).toBe("pronto");
    expect(await contarCategorias("Confirmada")).toBe(1);
    expect(pool.waitingCount).toBe(0);
  });

  it("faz ROLLBACK quando o trabalho lança, relança o mesmo erro e devolve a conexão ao pool", async () => {
    const original = new Error("falha no meio da transação");
    const conexoes: ConexaoEspionada[] = [];
    const conectar = pool.connect.bind(pool) as (...args: unknown[]) => Promise<PoolClient>;
    vi.spyOn(pool, "connect").mockImplementation(((...args: unknown[]) => {
      if (typeof args[0] === "function") return conectar(...args);
      return conectar().then((conexao) => {
        const liberar = conexao.release.bind(conexao);
        const release = vi.fn((erro?: Error | boolean) => liberar(erro));
        (conexao as unknown as { release: unknown }).release = release;
        conexoes.push({ release });
        return conexao;
      });
    }) as never);

    await expect(
      emTransacao(async (conexao) => {
        await conexao.query("INSERT INTO categorias (nome) VALUES ($1)", ["Desfeita"]);
        throw original;
      }),
    ).rejects.toBe(original);

    expect(await contarCategorias("Desfeita")).toBe(0);
    expect(conexoes).toHaveLength(1);
    // Sem erro no release: a conexão íntegra volta para o pool.
    expect(conexoes[0].release).toHaveBeenCalledTimes(1);
    expect(conexoes[0].release).toHaveBeenCalledWith(undefined);
  });

  it("com o ROLLBACK falhando: relança o erro original, registra a falha e descarta a conexão", async () => {
    const original = new Error("falha que causou o desfazimento");
    const conexoes = quebrarRollback();
    const registro = vi.spyOn(logger, "error");

    await expect(
      emTransacao(async () => {
        throw original;
      }, { traceId: "trace-de-teste" }),
    ).rejects.toBe(original);

    expect(registro).toHaveBeenCalledWith(
      expect.objectContaining({ causa: "falha que causou o desfazimento", traceId: "trace-de-teste" }),
      "Falha no ROLLBACK: a conexão foi descartada do pool",
    );
    // Com erro no release, o pg destrói a conexão em vez de reaproveitá-la.
    expect(conexoes[0].release).toHaveBeenCalledTimes(1);
    expect(conexoes[0].release.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe("POST /api/payments/confirm-simulated-payment com o ROLLBACK falhando (CONC-03)", () => {
  it("mais falhas do que o tamanho do pool não esgotam as conexões", async () => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    const cobranca = await criarCobranca(pedido);
    const confirmar = (billingId: string) => request(app)
      .post("/api/payments/confirm-simulated-payment")
      .set(...comToken(cliente.token))
      .send({ billingId });
    const conexoes = quebrarRollback();

    // A cobrança inexistente faz a transação lançar 404, a transação tenta o
    // ROLLBACK, e o ROLLBACK falha. O erro que chega ao cliente continua
    // sendo o original (404), não o do ROLLBACK.
    for (let tentativa = 0; tentativa < LIMITE_DO_POOL + 2; tentativa++) {
      esperarProblema(await confirmar("bill-sim-inexistente"), 404, "not-found");
    }

    expect(conexoes).toHaveLength(LIMITE_DO_POOL + 2);
    for (const conexao of conexoes) expect(conexao.release).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    expect((await confirmar(cobranca.billingId)).status).toBe(200);
    expect(pool.totalCount).toBeLessThanOrEqual(LIMITE_DO_POOL);
  });
});
