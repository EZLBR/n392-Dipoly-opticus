import { defineConfig } from "vitest/config";

// ============================================================
//   Duas suítes, com custos diferentes de execução.
//
//   unit        — regras puras. Sem banco, sem rede, sem app.
//                 AGENTS.md §5: "regras puras devem ser testáveis
//                 sem subir Express nem banco".
//   integration — sobe a app e fala com um PostgreSQL dedicado.
//
//   `npm test` roda as duas. `npm run test:unit` roda só a
//   primeira, que não exige nenhuma infraestrutura.
// ============================================================

const cobertura = {
  provider: "v8" as const,
  // AGENTS.md §10: a métrica não pode omitir arquivo sem teste.
  // No Vitest 4 isso é o padrão — todo arquivo casado por `include`
  // entra no relatório, tenha teste ou não. A opção `all` foi removida.
  include: ["src/**/*.ts"],
  exclude: ["src/**/*.d.ts", "src/server.ts", "src/scripts/**"],
};

export default defineConfig({
  test: {
    coverage: cobertura,

    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/{smoke,integration}/**/*.test.ts"],

          // Sobe o schema no banco de teste uma única vez, antes de tudo.
          globalSetup: ["./tests/setup/global-setup.ts"],

          // Roda antes de cada arquivo: registra a limpeza entre testes.
          setupFiles: ["./tests/setup/each-test.ts"],

          // As suítes compartilham um banco e a limpeza é por TRUNCATE.
          // Rodar arquivos em paralelo faria um apagar os dados do outro.
          fileParallelism: false,

          // Sobem app e banco; o padrão de 5s é apertado.
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
