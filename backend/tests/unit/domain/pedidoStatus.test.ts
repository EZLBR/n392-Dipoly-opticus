// ============================================================
//   FEAT-03 — Máquina de estados do pedido, sem banco nem Express
//
//   A tabela abaixo é a especificação: se alguém mudar uma
//   transição no domínio, este teste obriga a mudar aqui também,
//   de propósito.
// ============================================================

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import {
  STATUS_DO_PEDIDO,
  origensPermitidas,
  recusaDaTransicao,
  transicaoPermitida,
  type StatusDoPedido,
} from "../../../src/domain/pedidoStatus.js";

const PAPEIS = ["client", "factory", "staff"] as const;

const PERMITIDAS: Array<[StatusDoPedido, StatusDoPedido, readonly string[]]> = [
  ["Pending Payment", "Cancelled", ["staff"]],
  ["Queued", "In production", ["factory", "staff"]],
  ["Queued", "Delivered", ["factory", "staff"]],
  ["Queued", "Cancelled", ["staff"]],
  ["In production", "Delivered", ["factory", "staff"]],
  ["In production", "Cancelled", ["staff"]],
];

const esperado = (atual: StatusDoPedido, destino: StatusDoPedido, papel: string) =>
  PERMITIDAS.some(([de, para, papeis]) => de === atual && para === destino && papeis.includes(papel));

const combinacoes = STATUS_DO_PEDIDO.flatMap(atual =>
  STATUS_DO_PEDIDO.flatMap(destino => PAPEIS.map(papel => [atual, destino, papel] as const)));

describe("transicaoPermitida", () => {
  it.each(combinacoes)("%s → %s por %s segue a tabela", (atual, destino, papel) => {
    expect(transicaoPermitida(atual, destino, papel)).toBe(esperado(atual, destino, papel));
  });

  it("o cliente nunca altera status pela rota", () => {
    expect(combinacoes.filter(([, , papel]) => papel === "client").some(([a, d]) => transicaoPermitida(a, d, "client")))
      .toBe(false);
  });

  it("nenhuma transição manual sai de Pending Payment para Queued nem volta para Pending Payment", () => {
    for (const papel of PAPEIS) {
      expect(transicaoPermitida("Pending Payment", "Queued", papel)).toBe(false);
      expect(origensPermitidas("Pending Payment", papel)).toEqual([]);
    }
  });
});

describe("origensPermitidas", () => {
  it("lista os status de onde o papel chega ao destino", () => {
    expect(origensPermitidas("Delivered", "factory")).toEqual(["Queued", "In production"]);
    expect(origensPermitidas("Cancelled", "staff")).toEqual(["Pending Payment", "Queued", "In production"]);
    expect(origensPermitidas("Cancelled", "factory")).toEqual([]);
    expect(origensPermitidas("Queued", "staff")).toEqual([]);
  });
});

describe("recusaDaTransicao", () => {
  it("é null quando a transição vale", () => {
    expect(recusaDaTransicao("Queued", "In production", "factory")).toBeNull();
  });

  it.each([
    ["Queued", "Queued", "factory", "transicao", "já está em \"Queued\""],
    ["Pending Payment", "Queued", "staff", "transicao", "Apenas a confirmação do pagamento"],
    ["Delivered", "In production", "staff", "transicao", "não muda mais de status"],
    ["Cancelled", "Queued", "staff", "transicao", "não muda mais de status"],
    ["Queued", "Cancelled", "factory", "papel", "Apenas staff"],
    ["Pending Payment", "Delivered", "factory", "transicao", "não permitida"],
    ["In production", "Queued", "staff", "transicao", "não permitida"],
  ] as const)("%s → %s por %s: %s", (atual, destino, papel, tipo, trecho) => {
    const recusa = recusaDaTransicao(atual, destino, papel);
    expect(recusa?.tipo).toBe(tipo);
    expect(recusa?.motivo).toContain(trecho);
  });
});

// O frontend esconde as opções que o servidor recusaria, com
// frontend/src/utils/orderStatus.ts. Se as duas tabelas divergirem, o
// painel oferece uma mudança que vira 409, ou esconde uma que valeria.
describe("contrato com a prévia do frontend", () => {
  it("nextStatuses oferece exatamente as transições do domínio", async () => {
    const caminho = fileURLToPath(new URL("../../../../frontend/src/utils/orderStatus.ts", import.meta.url));
    const { nextStatuses } = (await import(/* @vite-ignore */ caminho)) as {
      nextStatuses: (atual: string, papel: string) => string[];
    };
    for (const atual of STATUS_DO_PEDIDO) {
      for (const papel of PAPEIS) {
        expect(nextStatuses(atual, papel), `${atual} por ${papel}`)
          .toEqual(STATUS_DO_PEDIDO.filter(destino => transicaoPermitida(atual, destino, papel)));
      }
    }
  });
});
