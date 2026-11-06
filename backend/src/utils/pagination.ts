export interface PaginationResult {
  isValid: boolean;
  page: number;
  limit: number;
  offset: number;
  error?: string;
}

export function parsePagination(
  query: { page?: unknown; limit?: unknown },
  defaultLimit = 20,
  maxLimit = 100
): PaginationResult {
  let page = 1;
  let limit = defaultLimit;

  if (query.page !== undefined && query.page !== "") {
    const rawPage = String(query.page).trim();
    if (!/^\d+$/.test(rawPage)) {
      return {
        isValid: false,
        page: 1,
        limit: defaultLimit,
        offset: 0,
        error: "O parâmetro 'page' deve ser um número inteiro positivo maior que zero."
      };
    }

    const parsedPage = Number(rawPage);
    if (parsedPage <= 0 || !Number.isSafeInteger(parsedPage)) {
      return {
        isValid: false,
        page: 1,
        limit: defaultLimit,
        offset: 0,
        error: "O parâmetro 'page' deve ser um número inteiro positivo maior que zero."
      };
    }

    page = parsedPage;
  }

  if (query.limit !== undefined && query.limit !== "") {
    const rawLimit = String(query.limit).trim();
    if (!/^\d+$/.test(rawLimit)) {
      return {
        isValid: false,
        page,
        limit: defaultLimit,
        offset: 0,
        error: "O parâmetro 'limit' deve ser um número inteiro positivo maior que zero."
      };
    }

    const parsedLimit = Number(rawLimit);
    if (parsedLimit <= 0 || !Number.isSafeInteger(parsedLimit)) {
      return {
        isValid: false,
        page,
        limit: defaultLimit,
        offset: 0,
        error: "O parâmetro 'limit' deve ser um número inteiro positivo maior que zero."
      };
    }

    limit = Math.min(parsedLimit, maxLimit);
  }

  const offset = Math.max((page - 1) * limit, 0);

  return {
    isValid: true,
    page,
    limit,
    offset
  };
}
