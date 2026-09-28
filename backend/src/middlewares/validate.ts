import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodIssue, type ZodTypeAny } from "zod";

/**
 * Atribui propriedades em req (como query e params) de forma segura em ambientes
 * ES Modules/Strict Mode onde IncomingMessage pode definir apenas um getter na cadeia.
 */
function setReqProperty(req: Request, prop: "query" | "params", value: unknown): void {
  Object.defineProperty(req, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Valida o corpo (req.body) com o schema Zod fornecido.
 * Em caso de sucesso, substitui req.body pelos dados validados/sanitizados.
 * Em caso de falha, repassa o erro (ZodError) para o next(), que será capturado
 * e formatado como 400 Bad Request com invalidParams pelo problemErrorHandler.
 */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Valida os parâmetros de query (req.query) com o schema Zod fornecido.
 */
export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      setReqProperty(req, "query", schema.parse(req.query));
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Valida os parâmetros de rota (req.params) com o schema Zod fornecido.
 */
export function validateParams<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      setReqProperty(req, "params", schema.parse(req.params));
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Valida simultaneamente body, query e/ou params, agregando todos os erros
 * em um único ZodError para retorno consolidado.
 */
export function validateRequest<
  TBody extends ZodTypeAny = ZodTypeAny,
  TQuery extends ZodTypeAny = ZodTypeAny,
  TParams extends ZodTypeAny = ZodTypeAny,
>(schemas: {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: ZodIssue[] = [];

    if (schemas.params) {
      const res = schemas.params.safeParse(req.params);
      if (!res.success) {
        issues.push(...res.error.issues);
      } else {
        setReqProperty(req, "params", res.data);
      }
    }

    if (schemas.query) {
      const res = schemas.query.safeParse(req.query);
      if (!res.success) {
        issues.push(...res.error.issues);
      } else {
        setReqProperty(req, "query", res.data);
      }
    }

    if (schemas.body) {
      const res = schemas.body.safeParse(req.body);
      if (!res.success) {
        issues.push(...res.error.issues);
      } else {
        req.body = res.data;
      }
    }

    if (issues.length > 0) {
      return next(new ZodError(issues));
    }

    next();
  };
}
