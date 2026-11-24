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

## Status do pedido (FEAT-03)

`PUT /api/orders/:publicId/status` só aceita as transições abaixo. A tabela vive em
`backend/src/domain/pedidoStatus.ts`; o painel usa a cópia de
`frontend/src/utils/orderStatus.ts` apenas para esconder opções, e um teste do backend
confere que as duas são iguais.

| Status atual | Pode ir para | Quem |
| --- | --- | --- |
| Pending Payment | Queued | **só a confirmação do pagamento** (webhook ou simulador), nunca a rota de status |
| Pending Payment | Cancelled | staff |
| Queued | In production, Delivered | factory, staff |
| Queued | Cancelled | staff |
| In production | Delivered | factory, staff |
| In production | Cancelled | staff |
| Delivered, Cancelled | — | status finais |

- Transição que ninguém pode fazer pela rota responde **409**, com o motivo em `detail`.
- Transição que existe, mas não para o papel (fábrica cancelando), responde **403**.
- Pedido inexistente ou de outra fábrica continua no mesmo **404**, mesmo quando a transição
  seria inválida.
- A guarda fica no próprio `UPDATE` (`status IN (...)`), então atualizações simultâneas não
  furam a regra.
- `POST /api/payments/create-billing` só cobra pedido em `Pending Payment`. Para os demais
  status responde **409** antes de chamar o gateway, e o pedido não volta para
  `Pending Payment`.
- Cancelar um pedido já pago não faz estorno automático: o estorno é tratado fora do sistema.

### Trava otimista (CONC-02)

O corpo do `PUT /api/orders/:publicId/status` leva a versão do pedido que o cliente leu:

```json
{ "status": "In production", "version": 3 }
```

- A versão vem na listagem (`GET /api/orders`) e na resposta da própria atualização.
- Se o pedido mudou depois da leitura, a resposta é **409**
  ("O pedido foi alterado por outra pessoa…") e nada é gravado. O painel recarrega a lista e
  pede para a pessoa conferir e decidir de novo.
- Versão ausente, fracionária, negativa ou acima do `INTEGER` responde **400** com
  `invalidParams` apontando `version`.
- Toda escrita em `pedidos` avança a versão, pelo trigger `pedidos_version_trigger`: também a
  cobrança, a confirmação de pagamento e o checkout, que não passam pela rota de status.
