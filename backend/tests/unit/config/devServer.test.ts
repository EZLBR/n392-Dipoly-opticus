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
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

describe("npm run dev", () => {
  it("o tsx consegue carregar e montar a aplicação", async () => {
    const script = "import('./src/app.ts').then(m => { m.createApp(); console.log('APP_OK'); })";
    // O próprio node com o loader do tsx: sem `npx`, que no Windows é
    // `npx.cmd` e não roda sem shell. O fileURLToPath decodifica espaços
    // ("%20") e a letra do disco, que o `.pathname` deixaria inválidos.
    const { stdout } = await exec(process.execPath, ["--import", "tsx", "-e", script], {
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
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
