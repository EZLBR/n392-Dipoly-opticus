import { createHmac, timingSafeEqual } from "node:crypto";

// Chave pública oficial, não é um segredo. Exige também o segredo privado da URL.
// https://docs.abacatepay.com/pages/webhooks/security
const ABACATEPAY_PUBLIC_KEY = "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

export function textoSecretoIgual(recebido: unknown, esperado: string | undefined): boolean {
  if (typeof recebido !== "string" || !esperado) return false;
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assinaturaWebhookValida(rawBody: Buffer | undefined, assinatura: unknown): boolean {
  if (!rawBody) return false;
  const esperada = createHmac("sha256", ABACATEPAY_PUBLIC_KEY).update(rawBody).digest("base64");
  return textoSecretoIgual(assinatura, esperada);
}
