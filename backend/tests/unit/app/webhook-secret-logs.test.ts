import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../../src/app.js";
import logger from "../../../src/utils/logger.js";

afterEach(() => vi.restoreAllMocks());

it("não registra nem ecoa segredo de URL em logs e erros de rota", async () => {
  const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
  const app = createApp({ requestLogging: true, rateLimit: false });
  const segredo = "segredo-privado-nao-pode-aparecer";
  const res = await request(app).get("/rota-inexistente").query({ webhookSecret: segredo });
  expect(res.status).toBe(404);
  expect(JSON.stringify(info.mock.calls)).not.toContain(segredo);
  expect(res.text).not.toContain(segredo);
});
