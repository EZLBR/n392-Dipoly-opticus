import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodIssue, type ZodTypeAny } from "zod";

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
 * Usa Object.defineProperty para contornar o getter nativo do Express 5 em req.query.
 */
export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.query);
      Object.defineProperty(req, "query", {
        value: parsed,
        writable: true,
        configurable: true,
        enumerable: true,
      });
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
      const parsed = schema.parse(req.params);
      Object.defineProperty(req, "params", {
        value: parsed,
        writable: true,
        configurable: true,
        enumerable: true,
      });
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
        Object.defineProperty(req, "params", {
          value: res.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    }

    if (schemas.query) {
      const res = schemas.query.safeParse(req.query);
      if (!res.success) {
        issues.push(...res.error.issues);
      } else {
        Object.defineProperty(req, "query", {
          value: res.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
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
