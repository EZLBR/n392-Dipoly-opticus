# Convenções da API

Respostas de erro da nova API devem usar `application/problem+json` conforme RFC 9457, com pelo menos `type`, `title`, `status` e, quando seguro, `detail` e `instance`.

Regras iniciais:

- não expor stack traces, SQL, tokens ou detalhes internos;
- usar URIs estáveis para os tipos de problema;
- incluir um identificador de correlação para investigação;
- representar erros de validação por uma extensão documentada;
- manter o status HTTP coerente com o campo `status`.

Exemplo de forma, não de implementação:

```json
{
  "type": "https://opticus.example/problems/forbidden",
  "title": "Acesso não autorizado ao recurso",
  "status": 403,
  "instance": "/orders/01J...",
  "traceId": "01J..."
}
```
