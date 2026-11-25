import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

type SmtpEnv = Partial<Record<
  "SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASSWORD" | "SMTP_FROM" | "NODE_ENV",
  string
>>;

/**
 * Configuração de envio resolvida a partir do ambiente.
 * - `ethereal`: fora de produção e sem nenhuma variável SMTP.
 * - `disabled`: produção sem nenhuma variável SMTP (envio registrado como falha).
 * - `smtp`: configuração completa e válida.
 */
export type SmtpConfig =
  | { kind: "ethereal" }
  | { kind: "disabled" }
  | { kind: "smtp"; host: string; port: number; user: string; password: string; from: string };

/** Lança erro quando há configuração SMTP parcial ou inválida. Chamado no boot. */
export function readSmtpConfig(source: SmtpEnv = process.env): SmtpConfig {
  const host = source.SMTP_HOST?.trim();
  const from = source.SMTP_FROM?.trim();
  const user = source.SMTP_USER?.trim();
  const password = source.SMTP_PASSWORD;
  const rawPort = source.SMTP_PORT?.trim();
  const anySet = [host, from, user, password, rawPort].some(Boolean);

  if (!anySet) {
    return source.NODE_ENV === "production" ? { kind: "disabled" } : { kind: "ethereal" };
  }

  const port = Number(rawPort || 587);
  if (!host || !from || !user || !password) {
    throw new Error("Configuração SMTP incompleta: defina SMTP_HOST, SMTP_USER, SMTP_PASSWORD e SMTP_FROM.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT deve ser um número inteiro entre 1 e 65535.");
  }
  return { kind: "smtp", host, port, user, password, from };
}

interface MailTransport {
  transporter: Transporter;
  from: string;
  ethereal: boolean;
}

let transportPromise: Promise<MailTransport> | undefined;

async function createMailTransport(): Promise<MailTransport> {
  const config = readSmtpConfig();

  if (config.kind === "disabled") {
    throw new Error("SMTP não configurado em produção.");
  }

  if (config.kind === "ethereal") {
    const account = await nodemailer.createTestAccount();
    return {
      transporter: nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        requireTLS: true,
        auth: { user: account.user, pass: account.pass },
      }),
      from: '"Opticus Notifications" <no-reply@opticus.com>',
      ethereal: true,
    };
  }

  return {
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    }),
    from: config.from,
    ethereal: false,
  };
}

/** Mensagens "enviadas" com NODE_ENV=test, em ordem. */
export const mensagensDeTeste: { to: string; subject: string; html: string }[] = [];

/** Envia o e-mail. Devolve o link de visualização quando o transporte é o Ethereal. */
export async function sendEmail(to: string, subject: string, html: string): Promise<{ previewUrl?: string }> {
  // RNF52: a suíte nunca abre conexão SMTP. Qualquer remetente cai aqui.
  if (process.env.NODE_ENV === "test") {
    mensagensDeTeste.push({ to, subject, html });
    return {};
  }
  transportPromise ??= createMailTransport().catch((error: unknown) => {
    transportPromise = undefined;
    throw error;
  });
  const { transporter, from, ethereal } = await transportPromise;
  const info = await transporter.sendMail({ from, to, subject, html });
  return { previewUrl: ethereal ? nodemailer.getTestMessageUrl(info) || undefined : undefined };
}

/** Só para testes: descarta o transporte em cache. */
export function resetMailTransport(): void {
  transportPromise = undefined;
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}
