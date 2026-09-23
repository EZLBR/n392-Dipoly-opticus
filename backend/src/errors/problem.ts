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
  readonly type = "https://opticus.example/problems/not-found";
  readonly title = "Recurso não encontrado";
  readonly status = 404;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class ConflictProblem extends HttpProblem {
  readonly type = "https://opticus.example/problems/conflict";
  readonly title = "Conflito com o estado atual do recurso";
  readonly status = 409;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class ForbiddenProblem extends HttpProblem {
  readonly type = "https://opticus.example/problems/forbidden";
  readonly title = "Acesso não autorizado ao recurso";
  readonly status = 403;

  constructor(detail?: string, init: ProblemInit = {}) {
    super(detail, init);
  }
}

export class ValidationProblem extends HttpProblem {
  readonly type = "https://opticus.example/problems/validation";
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