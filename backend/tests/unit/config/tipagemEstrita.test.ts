// ============================================================
//   TS-01 — Tipagem estrita no backend
//
//   O `npm run typecheck` com `strict: true` já recusa any implícito.
//   Este teste guarda o que o compilador sozinho não impede:
//     - alguém desligar `strict` ou uma das suas flags no tsconfig;
//     - um `any` escrito explicitamente no código;
//     - um handler exportado sem Request/Response tipados.
//
//   As linhas devolvidas por `pool.query` sem tipo genérico ainda são
//   `any` por padrão do driver pg; elas somem com a migração dos
//   controllers para o Prisma Client (DB-03, #24).
// ============================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const raizBackend = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const raizSrc = join(raizBackend, "src");

function arquivosTs(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((nome) => {
    const caminho = join(diretorio, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith(".ts") ? [caminho] : [];
  });
}

/** Código sem comentários, para que a palavra "any" em texto não conte. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** `any` usado como tipo: anotação, asserção, genérico ou array. */
const ANY_EXPLICITO = /:\s*any\b|\bas\s+any\b|<\s*any\s*[,>]|,\s*any\s*>|\bany\s*\[\]/;

const FLAGS_DO_STRICT = [
  "noImplicitAny",
  "strictNullChecks",
  "strictFunctionTypes",
  "strictBindCallApply",
  "strictPropertyInitialization",
  "noImplicitThis",
  "useUnknownInCatchVariables",
  "alwaysStrict",
];

describe("TS-01: tipagem estrita no backend", () => {
  it("o tsconfig mantém strict ligado, sem desligar nenhuma flag dele", () => {
    const { compilerOptions } = JSON.parse(readFileSync(join(raizBackend, "tsconfig.json"), "utf8"));
    expect(compilerOptions.strict).toBe(true);
    for (const flag of FLAGS_DO_STRICT) {
      expect(compilerOptions[flag], flag).not.toBe(false);
    }

    // A configuração dos testes herda a do código e não pode afrouxá-la.
    const testes = JSON.parse(readFileSync(join(raizBackend, "tsconfig.test.json"), "utf8"));
    expect(testes.extends).toBe("./tsconfig.json");
    expect(testes.compilerOptions.strict).not.toBe(false);
    for (const flag of FLAGS_DO_STRICT) {
      expect(testes.compilerOptions[flag], flag).not.toBe(false);
    }
  });

  it("nenhum arquivo de src usa any explícito", () => {
    const ocorrencias = arquivosTs(raizSrc).flatMap((arquivo) =>
      semComentarios(readFileSync(arquivo, "utf8"))
        .split("\n")
        .map((linha, i) => ({ linha, numero: i + 1 }))
        .filter(({ linha }) => ANY_EXPLICITO.test(linha))
        .map(({ linha, numero }) => `${relative(raizSrc, arquivo)}:${numero}: ${linha.trim()}`),
    );
    expect(ocorrencias).toEqual([]);
  });

  it("a detecção de any explícito reconhece as formas comuns e ignora texto", () => {
    for (const codigo of ["let x: any;", "(y as any)", "Promise<any>", "Record<string, any>", "const z: any[] = []"]) {
      expect(ANY_EXPLICITO.test(semComentarios(codigo)), codigo).toBe(true);
    }
    for (const codigo of ["// qualquer any aqui", "/* as any */", "const company = 1;", "manyItems: number"]) {
      expect(ANY_EXPLICITO.test(semComentarios(codigo)), codigo).toBe(false);
    }
  });

  it("todo handler exportado pelos controllers tipa Request e Response", () => {
    const controllers = arquivosTs(join(raizSrc, "controllers"));
    const handlers = controllers.flatMap((arquivo) =>
      [...readFileSync(arquivo, "utf8").matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)]
        .map(([, nome, parametros]) => ({ nome: `${relative(raizSrc, arquivo)}#${nome}`, parametros })),
    );

    expect(handlers.length).toBeGreaterThan(20);
    const semTipo = handlers
      .filter(({ parametros }) => !/\breq:\s*Request\b/.test(parametros) || !/\bres:\s*Response\b/.test(parametros))
      .map(({ nome }) => nome);
    expect(semTipo).toEqual([]);
  });

  it("o handler de erro global é um ErrorRequestHandler (quatro parâmetros tipados)", () => {
    const codigo = readFileSync(join(raizSrc, "middlewares/problemErrorHandler.ts"), "utf8");
    expect(codigo).toMatch(/export const problemErrorHandler:\s*ErrorRequestHandler\s*=\s*\(err, req, res, next\)/);
  });
});
