import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

interface MailTransport {
  transporter: Transporter;
  from: string;
}

let transportPromise: Promise<MailTransport> | undefined;

async function createMailTransport(): Promise<MailTransport> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, NODE_ENV } = process.env;
  const host = SMTP_HOST?.trim();
  if (!host && NODE_ENV !== "production" && ![SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM].some(Boolean)) {
    const account = await nodemailer.createTestAccount();
    return {
      transporter: nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        requireTLS: true,
        auth: { user: account.user, pass: account.pass },
      }),
      from: '"Opticus Notifications" <no-reply@opticus.com>',
    };
  }

  const port = Number(SMTP_PORT || 587);
  const from = SMTP_FROM?.trim();
  if (!host || !from || !SMTP_USER || !SMTP_PASSWORD || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Configuração SMTP incompleta ou inválida.");
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    }),
    from,
  };
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  transportPromise ??= createMailTransport().catch((error: unknown) => {
    transportPromise = undefined;
    throw error;
  });
  const { transporter, from } = await transportPromise;
  await transporter.sendMail({ from, to, subject, html });
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}
