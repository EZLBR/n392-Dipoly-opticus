// ============================================================
//   CONC-03 — A conexão da transação sempre volta ao pool
//
//   O checkout liberava a conexão só no catch e depois dele. Se o
//   ROLLBACK lançasse, o release nunca rodava: a conexão vazava, e o
//   pool, de 10, travava a API depois de 10 falhas. Os testes usam o
//   pool real da aplicação e simulam a falha do ROLLBACK numa conexão
//   de verdade.
// ============================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import type { PoolClient } from "pg";
import pool from "../../src/config/db.js";
import { emTransacao } from "../../src/config/transacao.js";
import logger from "../../src/utils/logger.js";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
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

describe("POST /api/orders/checkout-cart com o ROLLBACK falhando (CONC-03)", () => {
  it("mais falhas do que o tamanho do pool não esgotam as conexões", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");
    const itemValido = {
      productName: "Wayfarer",
      factoryName: "Fabrica",
      quantity: 1,
      customSpecs: {
        isSunglasses: false,
        frameProfile: "medium",
        frameMaterial: "acetate",
        lensMaterial: "cr39",
        lensTreatments: [],
      },
    };
    const conexoes = quebrarRollback();

    // A fábrica inexistente viola a chave estrangeira no INSERT, a transação
    // tenta o ROLLBACK, e o ROLLBACK falha. O erro que chega ao cliente
    // continua sendo o da chave estrangeira (409), não o do ROLLBACK.
    for (let tentativa = 0; tentativa < LIMITE_DO_POOL + 2; tentativa++) {
      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send({ cartItems: [{ ...itemValido, factoryId: 999_999 }] });
      esperarProblema(res, 409, "conflict");
    }

    expect(conexoes).toHaveLength(LIMITE_DO_POOL + 2);
    for (const conexao of conexoes) expect(conexao.release).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send({ cartItems: [{ ...itemValido, factoryId: fabrica.id }] });
    expect(res.status).toBe(200);
    expect(pool.totalCount).toBeLessThanOrEqual(LIMITE_DO_POOL);
  });
});
