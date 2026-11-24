// ============================================================
//   docs/api/openapi.json cobre exatamente as rotas da API
//
//   Lê as rotas do código (os `app.use` de app.ts e os `router.*` de
//   cada arquivo de rotas) e compara com a especificação. Uma rota
//   nova sem documentação, ou uma rota documentada que não existe
//   mais, faz este teste falhar.
// ============================================================

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const backend = new URL("../../../", import.meta.url);
const ler = (caminho: string) => readFileSync(new URL(caminho, backend), "utf8");

const spec = JSON.parse(ler("../docs/api/openapi.json")) as {
  openapi: string;
  paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
  components: { schemas: Record<string, unknown>; responses: Record<string, unknown> };
};

/** "/users/:publicId" → "/users/{publicId}", sem barra final. */
function normalizar(caminho: string): string {
  const semBarra = caminho.replace(/\/+$/, "") || "/";
  return semBarra.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function rotasDoCodigo(): string[] {
  const app = ler("src/app.ts");
  const importacoes = new Map<string, string>();
  for (const [, nome, arquivo] of app.matchAll(/import (?:\{ )?(\w+)(?: \})? from "\.\/routes\/(\w+)\.js";/g)) {
    importacoes.set(nome, arquivo);
  }

  const rotas: string[] = [];
  for (const [, base, alvo] of app.matchAll(/app\.use\("(\/api[^"]*)",\s*(\w+)/g)) {
    const arquivo = importacoes.get(alvo);
    if (!arquivo) throw new Error(`Não achei o arquivo de rotas de ${alvo}`);
    const fonte = ler(`src/routes/${arquivo}.ts`);
    for (const [, metodo, caminho] of fonte.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g)) {
      rotas.push(`${metodo.toUpperCase()} ${normalizar(base + caminho)}`);
    }
  }
  for (const [, metodo, caminho] of app.matchAll(/app\.(get|post)\("(\/[^"]*)"/g)) {
    rotas.push(`${metodo.toUpperCase()} ${normalizar(caminho)}`);
  }
  return rotas.sort();
}

function rotasDaSpec(): string[] {
  return Object.entries(spec.paths)
    .flatMap(([caminho, metodos]) => Object.keys(metodos).map(metodo => `${metodo.toUpperCase()} ${caminho}`))
    .sort();
}

describe("especificação OpenAPI", () => {
  it("é OpenAPI 3.1", () => {
    expect(spec.openapi).toBe("3.1.0");
  });

  it("documenta exatamente as rotas registradas no código", () => {
    const codigo = rotasDoCodigo();
    expect(codigo.length).toBeGreaterThan(30);
    expect(rotasDaSpec()).toEqual(codigo);
  });

  it("toda operação tem respostas, e toda referência existe", () => {
    const texto = JSON.stringify(spec);
    for (const [, nome] of texto.matchAll(/"#\/components\/(?:schemas|responses)\/(\w+)"/g)) {
      const existe = nome in spec.components.schemas || nome in spec.components.responses;
      expect(existe, `referência quebrada: ${nome}`).toBe(true);
    }
    for (const [caminho, metodos] of Object.entries(spec.paths)) {
      for (const [metodo, operacao] of Object.entries(metodos)) {
        expect(Object.keys(operacao.responses ?? {}).length, `${metodo} ${caminho} sem respostas`).toBeGreaterThan(0);
      }
    }
  });
});
