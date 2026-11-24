// ============================================================
//   `npm run dev` carrega a aplicação
//
//   O `npm run dev` usa o tsx, que compila arquivo por arquivo com o
//   esbuild. Um tipo reexportado como valor (`export { UmTipo }`) passa
//   no `tsc`, mas quebra o import em runtime. Este teste carrega a
//   aplicação pelo tsx, num processo separado, como o `npm run dev` faz.
//   O `isolatedModules` no tsconfig pega o mesmo erro no typecheck.
// ============================================================

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

describe("npm run dev", () => {
  it("o tsx consegue carregar e montar a aplicação", async () => {
    const script = "import('./src/app.ts').then(m => { m.createApp(); console.log('APP_OK'); })";
    const { stdout } = await exec("npx", ["tsx", "-e", script], {
      cwd: new URL("../../..", import.meta.url).pathname,
      env: { ...process.env, NODE_ENV: "test" },
      timeout: 60_000,
    });
    expect(stdout).toContain("APP_OK");
  }, 70_000);

  it("o tsconfig recusa reexportar tipo como valor (isolatedModules)", () => {
    const tsconfig = JSON.parse(readFileSync(new URL("../../../tsconfig.json", import.meta.url), "utf8"));
    expect(tsconfig.compilerOptions.isolatedModules).toBe(true);
  });
});
