// FE-08: somente o Explorer (/) e a autenticação (/login) são públicos.
// Toda rota privada é declarada aqui com os papéis que podem acessá-la; o
// guard das rotas e o redirecionamento pós-login usam a mesma tabela.

export type Role = "client" | "factory" | "staff";

export const STUDIO_ROLES: readonly Role[] = ["client", "staff"];
export const ORDER_ROLES: readonly Role[] = ["client"];
export const FACTORY_ROLES: readonly Role[] = ["factory"];
export const STAFF_ROLES: readonly Role[] = ["staff"];

const privateRoutes: { pattern: RegExp; roles: readonly Role[] }[] = [
  { pattern: /^\/create\/?$/, roles: STUDIO_ROLES },
  { pattern: /^\/designs\/?$/, roles: STUDIO_ROLES },
  { pattern: /^\/cart\/?$/, roles: STUDIO_ROLES },
  { pattern: /^\/orders(?:\/[^/]+)?\/?$/, roles: ORDER_ROLES },
  { pattern: /^\/factory-dashboard\/?$/, roles: FACTORY_ROLES },
  { pattern: /^\/staff-dashboard\/?$/, roles: STAFF_ROLES },
];

export function hasRole(role: unknown, roles: readonly Role[]) {
  return typeof role === "string" && (roles as readonly string[]).includes(role);
}

/** Página inicial de cada papel, usada após o login e quando o papel não pode abrir a rota pedida. */
export function homeFor(role: unknown) {
  if (role === "factory") return "/factory-dashboard";
  if (role === "staff") return "/staff-dashboard";
  return "/";
}

/**
 * Destino após o login. Só aceita uma rota privada interna conhecida que o
 * papel possa abrir; qualquer outro valor (URL externa, `//host`, rota
 * desconhecida ou de outro papel) cai na página inicial do papel.
 */
export function loginRedirectTarget(from: unknown, role: unknown) {
  const home = homeFor(role);
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//") || from.includes("\\")) {
    return home;
  }
  let url: URL;
  try {
    url = new URL(from, "http://opticus.local");
  } catch {
    return home;
  }
  if (url.origin !== "http://opticus.local") return home;
  const route = privateRoutes.find(({ pattern }) => pattern.test(url.pathname));
  if (!route || !hasRole(role, route.roles)) return home;
  return url.pathname + url.search;
}
