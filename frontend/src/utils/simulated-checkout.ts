import { apiClient, apiFetch, parseProblemDetails, ProblemError } from "./api";
import { getStoredLanguage, type Language } from "../contexts/LanguageContext";

export async function fetchSimulatedCheckoutHtml(checkoutUrl: string, language: Language = getStoredLanguage(), signal?: AbortSignal): Promise<string> {
  const api = new URL(import.meta.env.VITE_API_URL || "http://localhost:5000/api");
  const apiPath = api.pathname.replace(/\/$/, "");
  const expectedPath = (apiPath.endsWith("/api") ? apiPath : `${apiPath}/api`) + "/payments/simulated-checkout";
  const url = new URL(checkoutUrl);
  if (url.origin !== api.origin || url.pathname !== expectedPath || url.username || url.password) {
    throw new Error("Endereço de checkout simulado inválido.");
  }
  const response = await apiFetch(url, { headers: { "Accept-Language": language }, signal });
  if (!response.ok) throw new ProblemError(await parseProblemDetails(response));
  if (!response.headers.get("Content-Type")?.includes("text/html")) {
    throw new Error("Não foi possível abrir sua cobrança.");
  }
  return response.text();
}

/**
 * Confirma o pagamento simulado. A rota exige o dono autenticado (SEC-01):
 * o token vai no header Authorization via apiClient, nunca na URL nem no
 * corpo. 401 (sessão) e 404 (cobrança inexistente/de outro dono) chegam
 * como ProblemError para a tela tratar.
 */
export async function confirmSimulatedPayment(billingId: string): Promise<void> {
  await apiClient.post("/payments/confirm-simulated-payment", { billingId });
}
