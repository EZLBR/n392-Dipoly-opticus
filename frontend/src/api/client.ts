// ============================================================
//   API CLIENT — Centralizador de chamadas HTTP (FE-01)
//
//   - Centraliza resolução de VITE_API_URL em um único lugar
//   - Injeta automaticamente Authorization: Bearer <token>
//   - Faz parsing de RFC 9457 application/problem+json e lança ProblemError tipado
//   - Gerencia interceptores globais para 401 (redirecionamento) e 403 (alertas)
// ============================================================

export interface ProblemDetails {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  timestamp?: string;
  traceId?: string;
  error?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
  errors?: Array<{ field: string; message: string }>;
  [key: string]: unknown;
}

export class ProblemError extends Error {
  readonly status: number;
  readonly type?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly instance?: string;
  readonly timestamp?: string;
  readonly traceId?: string;
  readonly invalidParams?: Array<{ name: string; reason: string }>;
  readonly errors?: Array<{ field: string; message: string }>;
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    const message =
      problem.detail ||
      problem.title ||
      problem.error ||
      `A requisição falhou com status ${problem.status}`;
    super(message);
    this.name = "ProblemError";
    this.status = problem.status;
    this.type = problem.type;
    this.title = problem.title;
    this.detail = problem.detail;
    this.instance = problem.instance;
    this.timestamp = problem.timestamp;
    this.traceId = problem.traceId;
    this.invalidParams = problem.invalidParams;
    this.errors = problem.errors;
    this.problem = problem;
    Object.setPrototypeOf(this, ProblemError.prototype);
  }
}

// ─────────────────────────────────────────────────────────
//   Resolução Centralizada de URL (VITE_API_URL)
// ─────────────────────────────────────────────────────────

function getBaseUrl(): string {
  let url = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }
  if (!url.endsWith("/api")) {
    url = `${url}/api`;
  }
  return url;
}

export const API_BASE_URL: string = getBaseUrl();

export function resolveUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const cleanPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${API_BASE_URL}${cleanPath}`;
}

// ─────────────────────────────────────────────────────────
//   Manipuladores Globais de Autenticação (401 / 403)
// ─────────────────────────────────────────────────────────

export type AuthErrorHandler = (status: 401 | 403, problem: ProblemDetails) => void;
export type NavigateHandler = (path: string) => void;

let globalAuthErrorHandler: AuthErrorHandler | null = null;
let globalNavigateHandler: NavigateHandler | null = null;

export function setAuthErrorHandler(handler: AuthErrorHandler | null): void {
  globalAuthErrorHandler = handler;
}

export function setNavigateHandler(handler: NavigateHandler | null): void {
  globalNavigateHandler = handler;
}

export function handleAuthError(status: 401 | 403, problem: ProblemDetails): void {
  if (globalAuthErrorHandler) {
    globalAuthErrorHandler(status, problem);
  }
}

export function redirectToLogin(): void {
  if (globalNavigateHandler) {
    globalNavigateHandler("/login");
  } else if (typeof window !== "undefined" && window.location) {
    window.location.href = "/login";
  }
}

// ─────────────────────────────────────────────────────────
//   Parser de Problem Details
// ─────────────────────────────────────────────────────────

export async function parseProblemDetails(res: Response): Promise<ProblemDetails> {
  try {
    const clone = res.clone();
    const data = await clone.json();
    if (data && typeof data === "object") {
      return {
        ...data,
        status: typeof data.status === "number" ? data.status : res.status,
      };
    }
  } catch {
    // Falha silenciosa de JSON parsing (ex: resposta vazia ou texto)
  }

  return {
    status: res.status,
    title: res.statusText || `Erro HTTP ${res.status}`,
    detail: `Falha na requisição com status ${res.status}`,
  };
}

// ─────────────────────────────────────────────────────────
//   apiFetch: fetch de baixo nível com injeção de token e interceptores
// ─────────────────────────────────────────────────────────

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem("opticus_token");
  const headers = new Headers(init?.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    const problem = await parseProblemDetails(response);
    localStorage.removeItem("opticus_token");
    handleAuthError(401, problem);
    redirectToLogin();
  } else if (response.status === 403) {
    const problem = await parseProblemDetails(response);
    handleAuthError(403, problem);
  }

  return response;
}

// ─────────────────────────────────────────────────────────
//   apiRequest: chamada tipada de alto nível que lança ProblemError
// ─────────────────────────────────────────────────────────

export async function apiRequest<T = any>(
  pathOrUrl: string,
  init?: RequestInit
): Promise<T> {
  const url = resolveUrl(pathOrUrl);
  const response = await apiFetch(url, init);

  if (!response.ok) {
    const problem = await parseProblemDetails(response);
    throw new ProblemError(problem);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

// ─────────────────────────────────────────────────────────
//   apiClient: objeto centralizador com helpers HTTP
// ─────────────────────────────────────────────────────────

function prepareJsonBody(body: unknown, headers: Headers): any {
  if (
    body !== undefined &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    typeof body !== "string"
  ) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return JSON.stringify(body);
  }
  return body;
}

export const apiClient = {
  request: apiRequest,

  get: <T = any>(path: string, init?: RequestInit): Promise<T> => {
    return apiRequest<T>(path, { ...init, method: "GET" });
  },

  post: <T = any>(path: string, body?: unknown, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    const serializedBody = prepareJsonBody(body, headers);
    return apiRequest<T>(path, { ...init, method: "POST", headers, body: serializedBody });
  },

  put: <T = any>(path: string, body?: unknown, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    const serializedBody = prepareJsonBody(body, headers);
    return apiRequest<T>(path, { ...init, method: "PUT", headers, body: serializedBody });
  },

  patch: <T = any>(path: string, body?: unknown, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    const serializedBody = prepareJsonBody(body, headers);
    return apiRequest<T>(path, { ...init, method: "PATCH", headers, body: serializedBody });
  },

  delete: <T = any>(path: string, init?: RequestInit): Promise<T> => {
    return apiRequest<T>(path, { ...init, method: "DELETE" });
  },
};

export default apiClient;
