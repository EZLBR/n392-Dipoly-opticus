// ============================================================
//   mailTransport — escolha do transporte, validação e escape
//
//   Nenhum teste toca a rede: createTransport e createTestAccount
//   são substituídos por dublês.
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import {
  escapeEmailHtml,
  readSmtpConfig,
  resetMailTransport,
  sendEmail,
} from "../../../src/utils/mailTransport.js";

const completo = {
  SMTP_HOST: "smtp.exemplo.invalid",
  SMTP_PORT: "587",
  SMTP_USER: "usuario",
  SMTP_PASSWORD: "senha-de-teste",
  SMTP_FROM: "Opticus <no-reply@exemplo.invalid>",
};

describe("readSmtpConfig", () => {
  it("usa o Ethereal fora de produção quando nenhuma variável SMTP existe", () => {
    expect(readSmtpConfig({ NODE_ENV: "development" })).toEqual({ kind: "ethereal" });
  });

  it("nunca cai no Ethereal em produção", () => {
    expect(readSmtpConfig({ NODE_ENV: "production" })).toEqual({ kind: "disabled" });
  });

  it("ignora variáveis vazias ou só com espaços", () => {
    expect(readSmtpConfig({ NODE_ENV: "development", SMTP_HOST: "  ", SMTP_PORT: "" }))
      .toEqual({ kind: "ethereal" });
  });

  it.each(["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const)(
    "recusa configuração parcial sem %s",
    campo => {
      expect(() => readSmtpConfig({ ...completo, [campo]: "", NODE_ENV: "production" }))
        .toThrow(/incompleta/);
    },
  );

  it.each(["0", "65536", "abc", "587.5"])("recusa SMTP_PORT inválida (%s)", porta => {
    expect(() => readSmtpConfig({ ...completo, SMTP_PORT: porta })).toThrow(/SMTP_PORT/);
  });

  it("usa a porta 587 por padrão", () => {
    expect(readSmtpConfig({ ...completo, SMTP_PORT: "" })).toMatchObject({ kind: "smtp", port: 587 });
  });
});

describe("sendEmail", () => {
  afterEach(() => {
    resetMailTransport();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function dubleDeTransporte() {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "x" });
    const createTransport = vi.spyOn(nodemailer, "createTransport")
      .mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
    return { sendMail, createTransport };
  }

  function stubSmtp(porta: string) {
    for (const [nome, valor] of Object.entries({ ...completo, SMTP_PORT: porta })) vi.stubEnv(nome, valor);
  }

  it("porta 587 exige STARTTLS e usa o remetente configurado", async () => {
    stubSmtp("587");
    const { sendMail, createTransport } = dubleDeTransporte();

    const resultado = await sendEmail("cliente@exemplo.invalid", "Assunto", "<p>oi</p>");

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: completo.SMTP_HOST, port: 587, secure: false, requireTLS: true,
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: completo.SMTP_FROM }));
    expect(resultado.previewUrl).toBeUndefined();
  });

  it("porta 465 usa TLS direto", async () => {
    stubSmtp("465");
    const { createTransport } = dubleDeTransporte();

    await sendEmail("cliente@exemplo.invalid", "Assunto", "<p>oi</p>");

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true, requireTLS: false }));
  });

  it("em produção sem SMTP falha o envio e tenta de novo na próxima chamada", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const nome of Object.keys(completo)) vi.stubEnv(nome, "");
    const criarConta = vi.spyOn(nodemailer, "createTestAccount");

    await expect(sendEmail("a@exemplo.invalid", "s", "h")).rejects.toThrow(/não configurado/);
    await expect(sendEmail("a@exemplo.invalid", "s", "h")).rejects.toThrow(/não configurado/);
    expect(criarConta).not.toHaveBeenCalled();
  });

  it("com o Ethereal devolve o link de visualização", async () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const nome of Object.keys(completo)) vi.stubEnv(nome, "");
    vi.spyOn(nodemailer, "createTestAccount")
      .mockResolvedValue({ user: "u", pass: "p" } as Awaited<ReturnType<typeof nodemailer.createTestAccount>>);
    dubleDeTransporte();
    vi.spyOn(nodemailer, "getTestMessageUrl").mockReturnValue("https://ethereal.email/message/x");

    const resultado = await sendEmail("a@exemplo.invalid", "s", "h");

    expect(resultado.previewUrl).toBe("https://ethereal.email/message/x");
  });
});

describe("escapeEmailHtml", () => {
  it("escapa os caracteres especiais de HTML", () => {
    expect(escapeEmailHtml(`<img src=x onerror="a('b')">&`))
      .toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  });
});
