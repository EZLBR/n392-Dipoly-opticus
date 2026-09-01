// ============================================================
//   Instância da aplicação para os testes
//
//   Ponto único de construção da app. Se o backend novo mudar a
//   forma de montá-la, só este arquivo muda — os testes que a
//   consomem continuam iguais.
// ============================================================

import { createApp } from "../../src/app.js";

// createApp() já desliga rate limiting e log de requisição quando
// NODE_ENV=test. Um teste que exercite o rate limiting deve chamar
// createApp({ rateLimit: true }) por conta própria.
export const app = createApp();

export default app;
