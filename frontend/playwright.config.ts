import { defineConfig } from "@playwright/test";

const databaseUrl = process.env.OPTICUS_E2E_DATABASE_URL;
const database = databaseUrl ? new URL(databaseUrl) : null;
if (!database || !["postgres:", "postgresql:"].includes(database.protocol)
    || !["localhost", "127.0.0.1"].includes(database.hostname)
    || !database.pathname.endsWith("_test")) {
  throw new Error("Use OPTICUS_E2E_DATABASE_URL com um banco PostgreSQL local dedicado, terminado em _test.");
}

const frontend = "http://localhost:55712";
const backend = "http://localhost:55711";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    channel: "chromium",
    baseURL: frontend,
    actionTimeout: 12_000,
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  webServer: [
    {
      command: "npm run prisma:generate && npm run migrate && npm run seed:dev && npm run build && npm start",
      cwd: "../backend",
      url: `${backend}/health`,
      timeout: 60_000,
  expect: { timeout: 10_000 },
      env: {
        DATABASE_URL: databaseUrl!,
        NODE_ENV: "test",
        PORT: "55711",
        JWT_SECRET: "opticus-playwright-test-secret",
        ABACATE_TOKEN: "your_abacatepay_token_here",
        FRONTEND_URL: frontend,
      },
    },
    {
      command: "npm run build && npm run preview -- --host localhost --port 55712 --strictPort",
      url: frontend,
      env: { VITE_API_URL: `${backend}/api` },
    },
  ],
});
