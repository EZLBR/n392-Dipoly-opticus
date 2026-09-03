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

export const env = Object.freeze({
  NODE_ENV: readNodeEnv(process.env.NODE_ENV),
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
});
