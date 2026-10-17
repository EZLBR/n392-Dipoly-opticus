import dotenv from "dotenv";

dotenv.config();

const NODE_ENV_VALUES = ["development", "test", "production"] as const;
type NodeEnv = (typeof NODE_ENV_VALUES)[number];

function readNodeEnv(value: string | undefined): NodeEnv {
  const nodeEnv = value?.trim() || "development";

  if (!NODE_ENV_VALUES.includes(nodeEnv as NodeEnv)) {
    throw new Error(
      `NODE_ENV inválido: "${nodeEnv}". Use development, test ou production.`,
    );
  }

  return nodeEnv as NodeEnv;
}

function readPort(value: string | undefined): number {
  const port = value?.trim() ? Number(value) : 5000;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT deve ser um número inteiro entre 1 e 65535.");
  }

  return port;
}

/**
 * Valor de `ABACATE_TOKEN` que seleciona o gateway de pagamento simulado.
 * É o único valor não-secreto aceito, e apenas fora de produção.
 */
export const ABACATE_TOKEN_PLACEHOLDER = "your_abacatepay_token_here";

/** `ABACATE_TOKEN` está no modo simulado (placeholder do repositório)? */
export function isPlaceholderAbacateToken(value: string | undefined): boolean {
  return (value ?? "").includes("your_abacatepay");
}

/**
 * `ABACATE_TOKEN` é obrigatória em todos os ambientes (SEC-04): o webhook
 * só é confiável com um segredo para validar a assinatura. O placeholder
 * do simulador é aceito, mas nunca em produção — lá o token tem de ser real.
 */
export function readAbacateToken(value: string | undefined, nodeEnv: NodeEnv): string {
  const token = value?.trim();

  if (!token) {
    throw new Error(
      "ABACATE_TOKEN é obrigatória. Use um token real do AbacatePay ou o placeholder de simulador (your_abacatepay_token_here).",
    );
  }

  if (nodeEnv === "production" && isPlaceholderAbacateToken(token)) {
    throw new Error(
      "ABACATE_TOKEN não pode ser o placeholder de simulador em produção. Configure um token real.",
    );
  }

  return token;
}

function readRequiredUrl(
  name: "DATABASE_URL" | "FRONTEND_URL",
  value: string | undefined,
  allowedProtocols: readonly string[],
): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`${name} é obrigatória.`);
  }

  let url: URL;
  try {
    url = new URL(normalizedValue);
  } catch {
    throw new Error(`${name} deve conter uma URL válida.`);
  }

  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error(
      `${name} deve usar um dos protocolos: ${allowedProtocols.join(", ")}.`,
    );
  }

  return normalizedValue;
}

const nodeEnv = readNodeEnv(process.env.NODE_ENV);

export const env = Object.freeze({
  NODE_ENV: nodeEnv,
  PORT: readPort(process.env.PORT),
  DATABASE_URL: readRequiredUrl(
    "DATABASE_URL",
    process.env.DATABASE_URL,
    ["postgres:", "postgresql:"],
  ),
  FRONTEND_URL: readRequiredUrl(
    "FRONTEND_URL",
    process.env.FRONTEND_URL || "http://localhost:5173",
    ["http:", "https:"],
  ),
  ABACATE_TOKEN: readAbacateToken(process.env.ABACATE_TOKEN, nodeEnv),
});

/**
 * Lê `ABACATE_TOKEN` em tempo de chamada, nunca congelado no import.
 *
 * O boot valida a variável (acima), mas o valor é lido a cada uso para
 * que trocas controladas — como `vi.stubEnv` nos testes — valham sem
 * reiniciar o processo. É a partir daqui que o webhook assina o corpo.
 */
export function getAbacateToken(): string | undefined {
  const token = process.env.ABACATE_TOKEN?.trim();
  return token || undefined;
}

/**
 * O gateway está em modo simulado quando não há token real configurado.
 * Sem token ou com o placeholder, nenhuma chamada real é feita.
 */
export function isSimulatedPaymentGateway(): boolean {
  const token = getAbacateToken();
  return !token || isPlaceholderAbacateToken(token);
}
