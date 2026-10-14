import { apiFetch } from "./api";

export async function fetchSimulatedCheckoutHtml(checkoutUrl: string): Promise<string> {
  const api = new URL(import.meta.env.VITE_API_URL || "http://localhost:5000/api");
  const apiPath = api.pathname.replace(/\/$/, "");
  const expectedPath = (apiPath.endsWith("/api") ? apiPath : `${apiPath}/api`) + "/payments/simulated-checkout";
  const url = new URL(checkoutUrl);
  if (url.origin !== api.origin || url.pathname !== expectedPath || url.username || url.password) {
    throw new Error("Endereço de checkout simulado inválido.");
  }
  const response = await apiFetch(url);
  if (!response.ok || !response.headers.get("Content-Type")?.includes("text/html")) {
    throw new Error("Não foi possível abrir sua cobrança.");
  }
  return response.text();
}
