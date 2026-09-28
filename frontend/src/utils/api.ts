export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  timestamp?: string;
  traceId?: string;
  error?: string;
}

export type AuthErrorHandler = (status: 401 | 403, problem: ProblemDetails) => void;
export type NavigateHandler = (path: string) => void;

let globalAuthErrorHandler: AuthErrorHandler | null = null;
let globalNavigateHandler: NavigateHandler | null = null;

export function setAuthErrorHandler(handler: AuthErrorHandler | null) {
  globalAuthErrorHandler = handler;
}

export function setNavigateHandler(handler: NavigateHandler | null) {
  globalNavigateHandler = handler;
}

export function handleAuthError(status: 401 | 403, problem: ProblemDetails) {
  if (globalAuthErrorHandler) {
    globalAuthErrorHandler(status, problem);
  }
}

export function redirectToLogin() {
  if (globalNavigateHandler) {
    globalNavigateHandler("/login");
  } else if (typeof window !== "undefined" && window.location) {
    window.location.href = "/login";
  }
}

export async function parseProblemDetails(res: Response): Promise<ProblemDetails> {
  try {
    const clone = res.clone();
    const data = await clone.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

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
