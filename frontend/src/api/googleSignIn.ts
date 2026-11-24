import { apiClient, ProblemError } from "./client";
import type { Language } from "../contexts/LanguageContext";

const pendingKey = "opticus_google_sign_in";
const maxAgeMs = 10 * 60 * 1000;
interface GoogleAttempt {
  state: string;
  nonce: string;
  verifier: string;
  from?: string;
  createdAt: number;
}

const randomValue = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
  byte.toString(16).padStart(2, "0"),
).join("");

export async function beginGoogleSignIn(language: Language, from: unknown): Promise<string> {
  const attempt: GoogleAttempt = {
    state: randomValue(),
    nonce: randomValue(),
    verifier: randomValue(),
    from: typeof from === "string" ? from : undefined,
    createdAt: Date.now(),
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attempt.verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const response = await apiClient.post<{ url: string }>("/auth/google/start", {
    state: attempt.state, nonce: attempt.nonce, challenge,
  }, { headers: { "Accept-Language": language } });
  const url = new URL(response.url);
  if (url.origin !== "https://accounts.google.com") throw new Error("Invalid Google sign-in URL");
  sessionStorage.setItem(pendingKey, JSON.stringify(attempt));
  return url.href;
}

export function readGoogleCallback(search: string) {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const error = params.get("error");
  if (!code && !error) return null;

  let attempt: GoogleAttempt | undefined;
  try {
    const pending = sessionStorage.getItem(pendingKey);
    sessionStorage.removeItem(pendingKey);
    if (pending) attempt = JSON.parse(pending) as GoogleAttempt;
  } catch {
    // A malformed or obsolete entry is treated as an invalid callback.
  }

  if (!attempt?.state || attempt.state !== params.get("state")
      || typeof attempt.createdAt !== "number" || Date.now() - attempt.createdAt > maxAgeMs) {
    return { status: "invalid" } as const;
  }
  if (error === "access_denied") return { status: "cancelled" } as const;
  if (!code || error) return { status: "invalid" } as const;
  return { status: "ready", code, ...attempt } as const;
}

export function googleErrorKey(error: unknown): string {
  if (error instanceof ProblemError) {
    if (error.status === 503) return "auth-google-unavailable";
    if (error.status === 409) return "auth-google-conflict";
    if (error.status === 400 || error.status === 422) return "auth-google-invalid";
  }
  return "auth-google-error";
}
