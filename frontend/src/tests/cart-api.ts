// ============================================================
//   API do carrinho simulada (CART-01)
//
//   Reproduz o contrato do backend: um carrinho por conta (pelo token),
//   a mesma configuração soma na mesma linha, o preço vem do servidor e
//   o checkout só aceita o carrinho atual (409 se mudou). Permite
//   atrasar ou derrubar respostas, para os testes de sessão e de falha.
// ============================================================

import { vi } from "vitest";

export interface FakeUser { publicId: string; name: string; email: string; role: string }

interface Line {
  publicId: string;
  key: string;
  productName: string;
  factoryName: string;
  customSpecs: Record<string, unknown>;
  quantity: number;
  paymentPending: boolean;
}

export const UNIT_PRICE = 210;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const problem = (status: number, detail: string) =>
  new Response(JSON.stringify({ type: "about:blank", title: "Erro", status, detail }), {
    status, headers: { "Content-Type": "application/problem+json" },
  });

export function fakeCartApi(users: Record<string, FakeUser>) {
  const carts = new Map<string, Line[]>();
  let sequence = 0;
  /** Promessas que seguram a resposta de um caminho até o teste liberar. */
  const held: Array<{ match: (method: string, path: string) => boolean; gate: Promise<void> }> = [];
  /** Respostas forçadas: falha de servidor ou de rede no próximo pedido que casar. */
  const failures: Array<{ match: (method: string, path: string) => boolean; kind: "server" | "network" }> = [];
  const checkouts: unknown[] = [];

  const cartOf = (publicId: string) => {
    if (!carts.has(publicId)) carts.set(publicId, []);
    return carts.get(publicId)!;
  };
  const view = (publicId: string) => {
    const lines = cartOf(publicId);
    const items = lines.map(({ key: _key, ...line }) => ({
      ...line,
      factoryPublicId: null,
      unitPrice: UNIT_PRICE.toFixed(2),
      total: (UNIT_PRICE * line.quantity).toFixed(2),
    }));
    return { items, subtotal: (UNIT_PRICE * lines.reduce((sum, l) => sum + l.quantity, 0)).toFixed(2) };
  };

  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api/, "");
    const method = (init.method ?? "GET").toUpperCase();
    const auth = new Headers(init.headers).get("Authorization") ?? "";
    const token = auth.replace(/^Bearer /, "");

    const hold = held.find(h => h.match(method, path));
    if (hold) {
      held.splice(held.indexOf(hold), 1);
      await hold.gate;
    }
    const failure = failures.find(f => f.match(method, path));
    if (failure) {
      failures.splice(failures.indexOf(failure), 1);
      if (failure.kind === "network") throw new TypeError("Failed to fetch");
      return problem(500, "Ocorreu um erro interno no servidor.");
    }

    if (path === "/auth/login" && method === "POST") {
      const { email } = JSON.parse(String(init.body));
      const entry = Object.entries(users).find(([, user]) => user.email === email);
      return entry ? json({ token: entry[0], user: entry[1] }) : problem(401, "Email ou senha incorretos.");
    }

    const user = users[token];
    if (!user) return problem(401, "Token inválido.");
    if (path === "/auth/me") return json({ user });
    if (path === "/designs") return json({ designs: [] });

    const lines = cartOf(user.publicId);
    if (path === "/cart" && method === "GET") return json(view(user.publicId));
    if (path === "/cart" && method === "DELETE") { carts.set(user.publicId, []); return new Response(null, { status: 204 }); }
    if (path === "/cart/items" && method === "POST") {
      const body = JSON.parse(String(init.body));
      const key = JSON.stringify([body.productName, body.factoryName, body.customSpecs]);
      const existing = lines.find(line => line.key === key);
      if (existing) {
        existing.quantity += body.quantity;
        existing.paymentPending = false;
        return json(view(user.publicId));
      }
      lines.push({
        publicId: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
        key, productName: body.productName, factoryName: body.factoryName,
        customSpecs: body.customSpecs, quantity: body.quantity, paymentPending: false,
      });
      return json(view(user.publicId), 201);
    }
    const item = path.match(/^\/cart\/items\/(.+)$/)?.[1];
    if (item) {
      const line = lines.find(l => l.publicId === item);
      if (!line) return problem(404, "Item não encontrado no seu carrinho.");
      if (method === "PATCH") {
        line.quantity = JSON.parse(String(init.body)).quantity;
        line.paymentPending = false;
      } else {
        lines.splice(lines.indexOf(line), 1);
      }
      return json(view(user.publicId));
    }
    if (path === "/cart/checkout" && method === "POST") {
      const { items } = JSON.parse(String(init.body)) as { items: Array<{ publicId: string; quantity: number }> };
      checkouts.push({ token, items });
      const same = items.length === lines.length
        && lines.every(line => items.some(i => i.publicId === line.publicId && i.quantity === line.quantity));
      if (!same) {
        return problem(409, "Seu carrinho mudou em outra aba ou dispositivo. Revise os itens antes de pagar.");
      }
      lines.forEach(line => { line.paymentPending = true; });
      return json({ checkoutUrl: "https://gateway.invalid/pay/bill_1", isSimulated: false, billingId: "bill_1" });
    }
    throw new Error(`Rota inesperada: ${method} ${path}`);
  });

  return {
    fetch,
    checkouts,
    /** Carrinho de uma conta, direto no "servidor" (outra aba ou dispositivo). */
    serverCart: (publicId: string) => cartOf(publicId),
    addOnServer(publicId: string, productName: string, quantity = 1) {
      cartOf(publicId).push({
        publicId: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
        key: productName, productName, factoryName: "Demo Factory",
        customSpecs: { color: "#000000" }, quantity, paymentPending: false,
      });
    },
    /** Segura a próxima resposta que casar; devolve a função que a libera. */
    hold(method: string, path: string) {
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      held.push({ match: (m, p) => m === method && p === path, gate });
      return release;
    },
    failNext(method: string, path: string, kind: "server" | "network" = "server") {
      failures.push({ match: (m, p) => m === method && (p === path || p.startsWith(`${path}/`)), kind });
    },
  };
}
