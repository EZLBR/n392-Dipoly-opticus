// ============================================================
//   OPTICUS — Notificação de status de pedido por e-mail
//
//   Em NODE_ENV=test nada sai pela rede: a mensagem vai para uma
//   caixa de saída em memória, que os testes podem inspecionar.
//   Sem isso, `nodemailer.createTestAccount()` faz requisição ao
//   ethereal.email a cada atualização de status — e como o
//   disparo é fire-and-forget, a promessa fica pendurada depois
//   que o teste termina e o pool já fechou.
//
//   TODO(FEAT-05): configurar SMTP real por variável de ambiente.
//   Hoje, fora de teste, ainda usa conta descartável do Ethereal
//   e os e-mails não chegam ao cliente de verdade.
// ============================================================

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import logger from "./logger.js";

let transporter: Transporter | null = null;

export interface EmailDeStatus {
  para: string;
  assunto: string;
  html: string;
  pedidoId: number | string;
  status: string;
}

/**
 * Caixa de saída em memória, preenchida apenas quando NODE_ENV=test.
 *
 * Permite afirmar sobre o comportamento de notificação sem rede:
 *
 *   expect(caixaDeSaidaDeTeste).toHaveLength(1);
 *   expect(caixaDeSaidaDeTeste[0].status).toBe("Delivered");
 *
 * Limpe com `limparCaixaDeSaida()` entre testes.
 */
export const caixaDeSaidaDeTeste: EmailDeStatus[] = [];

export function limparCaixaDeSaida(): void {
  caixaDeSaidaDeTeste.length = 0;
}

function emModoDeTeste(): boolean {
  return process.env.NODE_ENV === "test";
}

async function initTransporter(): Promise<Transporter | null> {
  if (transporter) return transporter;

  try {
    // TODO(FEAT-05): trocar por credenciais de SMTP real vindas do ambiente.
    const testAccount = await nodemailer.createTestAccount();

    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    logger.info({ conta: testAccount.user }, "[email] transporte Ethereal pronto");
    return transporter;
  } catch (err) {
    logger.error({ err }, "[email] falha ao inicializar o transporte");
    return null;
  }
}

/** Monta assunto e corpo. Retorna null para status que não geram notificação. */
function montarMensagem(
  order: { id: number | string; customer_name?: string; product_name?: string; factory_name?: string },
  newStatus: string
): { assunto: string; html: string } | null {
  if (newStatus === "In production") {
    return {
      assunto: `Your Opticus Order ${order.id} is now In Production!`,
      html: `
      <h2>Great news, ${order.customer_name}!</h2>
      <p>Your custom 3D frame design (<strong>${order.product_name}</strong>) has been routed to <strong>${order.factory_name}</strong> and is currently in production.</p>
      <p>Our artisans are crafting your frame precisely to your specifications.</p>
      <p>We will notify you again once it has been shipped and delivered!</p>
      <br />
      <p>Best regards,</p>
      <p><strong>Opticus Eyewear Team</strong></p>
    `,
    };
  }

  if (newStatus === "Delivered") {
    return {
      assunto: `Your Opticus Order ${order.id} has been Delivered!`,
      html: `
      <h2>It's here, ${order.customer_name}!</h2>
      <p>Your custom frame (<strong>${order.product_name}</strong>) has been marked as <strong>Delivered</strong>.</p>
      <p>We hope you love your new personalized eyewear. Feel free to share your style on social media!</p>
      <br />
      <p>Best regards,</p>
      <p><strong>Opticus Eyewear Team</strong></p>
    `,
    };
  }

  // Queued, Pending Payment e Cancelled não notificam.
  return null;
}

export async function sendOrderStatusEmail(
  order: {
    id: number | string;
    customer_name?: string;
    customer_email?: string;
    product_name?: string;
    factory_name?: string;
  },
  newStatus: string
): Promise<void> {
  const mensagem = montarMensagem(order, newStatus);
  if (!mensagem) return;

  if (!order.customer_email) {
    logger.warn({ pedidoId: order.id }, "[email] pedido sem e-mail de cliente; nada enviado");
    return;
  }

  // ── Modo de teste: registra e retorna, sem tocar na rede ──
  if (emModoDeTeste()) {
    caixaDeSaidaDeTeste.push({
      para: order.customer_email,
      assunto: mensagem.assunto,
      html: mensagem.html,
      pedidoId: order.id,
      status: newStatus,
    });
    return;
  }

  const mailTransporter = await initTransporter();
  if (!mailTransporter) {
    logger.warn({ pedidoId: order.id }, "[email] transporte indisponível; envio ignorado");
    return;
  }

  try {
    const info = await mailTransporter.sendMail({
      from: '"Opticus Notifications" <no-reply@opticus.com>',
      to: order.customer_email,
      subject: mensagem.assunto,
      html: mensagem.html,
    });

    logger.info(
      { pedidoId: order.id, previewUrl: nodemailer.getTestMessageUrl(info) || undefined },
      "[email] mensagem enviada"
    );
  } catch (err) {
    // Falha de e-mail não pode derrubar a atualização de status do pedido,
    // mas nunca é silenciada: vai para o log estruturado.
    logger.error({ err, pedidoId: order.id, status: newStatus }, "[email] falha ao enviar");
  }
}
