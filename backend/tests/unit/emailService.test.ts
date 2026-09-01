// ============================================================
//   emailService — comportamento em modo de teste
//
//   O que importa aqui não é o texto do e-mail: é a garantia de
//   que nenhuma requisição sai para a rede durante a suíte. Sem
//   ela, cada atualização de status chama o ethereal.email e a
//   promessa fica pendurada depois do teste terminar, porque o
//   disparo em orderController.ts:217 é fire-and-forget.
// ============================================================

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import nodemailer from "nodemailer";
import {
  sendOrderStatusEmail,
  caixaDeSaidaDeTeste,
  limparCaixaDeSaida,
} from "../../src/utils/emailService.js";

const pedidoBase = {
  id: 42,
  customer_name: "Cliente Teste",
  customer_email: "cliente@exemplo.invalid",
  product_name: "Model Aurora",
  factory_name: "Fabrica Teste",
};

describe("sendOrderStatusEmail", () => {
  beforeEach(() => {
    limparCaixaDeSaida();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("não abre transporte nem toca na rede em modo de teste", async () => {
    const criarConta = vi.spyOn(nodemailer, "createTestAccount");
    const criarTransporte = vi.spyOn(nodemailer, "createTransport");

    await sendOrderStatusEmail(pedidoBase, "Delivered");

    expect(criarConta).not.toHaveBeenCalled();
    expect(criarTransporte).not.toHaveBeenCalled();
  });

  it("registra a mensagem na caixa de saída em vez de enviar", async () => {
    await sendOrderStatusEmail(pedidoBase, "Delivered");

    expect(caixaDeSaidaDeTeste).toHaveLength(1);
    expect(caixaDeSaidaDeTeste[0]).toMatchObject({
      para: "cliente@exemplo.invalid",
      pedidoId: 42,
      status: "Delivered",
    });
    expect(caixaDeSaidaDeTeste[0].assunto).toContain("Delivered");
  });

  it("notifica em 'In production'", async () => {
    await sendOrderStatusEmail(pedidoBase, "In production");

    expect(caixaDeSaidaDeTeste).toHaveLength(1);
    expect(caixaDeSaidaDeTeste[0].html).toContain("Fabrica Teste");
  });

  it.each(["Queued", "Pending Payment", "Cancelled"])(
    "não notifica no status %s",
    async (status) => {
      await sendOrderStatusEmail(pedidoBase, status);

      expect(caixaDeSaidaDeTeste).toHaveLength(0);
    }
  );

  it("não envia quando o pedido não tem e-mail de cliente", async () => {
    await sendOrderStatusEmail({ ...pedidoBase, customer_email: undefined }, "Delivered");

    expect(caixaDeSaidaDeTeste).toHaveLength(0);
  });

  it("resolve sem lançar, para não derrubar a atualização do pedido", async () => {
    await expect(sendOrderStatusEmail(pedidoBase, "Delivered")).resolves.toBeUndefined();
  });
});
