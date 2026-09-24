/** Namespace único das URIs de tipo de problema. Centraliza os slugs. */
export const PROBLEM_TYPE_NAMESPACE = "https://opticus.example/problems";

/** Monta a URI estável de um tipo de problema a partir de um slug. */
export function problemType(slug: string): string {
  return `${PROBLEM_TYPE_NAMESPACE}/${slug}`;
}

export interface ProblemInit {
  detail?: string;
  instance?: string;
}

export interface ValidationFieldError {
  field: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: ValidationFieldError[];
}

export abstract class HttpProblem extends Error {
  abstract readonly type: string;
  abstract readonly title: string;
  abstract readonly status: number;
  readonly detail?: string;
  readonly instance?: string;

  protected constructor(detail?: string, init: ProblemInit = {}) {
    const effectiveDetail = init.detail ?? detail;
    super(effectiveDetail ?? "Erro inesperado.");
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
    if (effectiveDetail !== undefined) {
      this.detail = effectiveDetail;
    }
    if (init.instance !== undefined) {
      this.instance = init.instance;
    }
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
  }

  toJSON(): ProblemDetails {
    const body: ProblemDetails = {
      type: this.type,
      title: this.title,
      status: this.status,
    };
    if (this.detail !== undefined) {
      body.detail = this.detail;
    }
    if (this.instance !== undefined) {
      body.instance = this.instance;
    }
    return body;
  }
}

export class NotFoundProblem extends HttpProblem {
  readonly type = problemType("not-found");
  readonly title = "Recurso não encontrado";
  readonly status = 404;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class ConflictProblem extends HttpProblem {
  readonly type = problemType("conflict");
  readonly title = "Conflito com o estado atual do recurso";
  readonly status = 409;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class ForbiddenProblem extends HttpProblem {
  readonly type = problemType("forbidden");
  readonly title = "Acesso não autorizado ao recurso";
  readonly status = 403;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class BadRequestProblem extends HttpProblem {
  readonly type = problemType("bad-request");
  readonly title = "Requisição inválida";
  readonly status = 400;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class UnauthorizedProblem extends HttpProblem {
  readonly type = problemType("unauthorized");
  readonly title = "Autenticação necessária";
  readonly status = 401;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class TooManyRequestsProblem extends HttpProblem {
  readonly type = problemType("rate-limit");
  readonly title = "Muitas requisições";
  readonly status = 429;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class InternalServerErrorProblem extends HttpProblem {
  readonly type = problemType("internal-error");
  readonly title = "Erro interno no servidor";
  readonly status = 500;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class ValidationProblem extends HttpProblem {
  readonly type = problemType("validation");
  readonly title = "Erro de validação";
  readonly status = 422;
  readonly errors: ValidationFieldError[];

  constructor(errors: ValidationFieldError[], init: ProblemInit = {}) {
    super(init.detail, init);
    this.errors = errors;
  }

  override toJSON(): ProblemDetails {
    return { ...super.toJSON(), errors: this.errors };
  }
}