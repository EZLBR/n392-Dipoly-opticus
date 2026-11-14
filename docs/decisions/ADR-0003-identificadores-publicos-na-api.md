# ADR-0003: A API identifica recursos só pelo `publicId`

- Status: aceito
- Data: 2026-11-14
- Issue: ID-02 (#31), depois de ID-01 (#30)

## Contexto

As tabelas usam `id SERIAL` como chave primária, e esse inteiro aparecia nas rotas (`/api/products/42`), nas respostas (`id`, `factoryId`, `categoria_id`, `produto_id`, `pedido_id`), nos corpos de requisição (`categoria_id`, `factoryId`, `orderId`) e no payload do token JWT (`id`). Um id sequencial revela volume de negócio (o pedido 42 indica que existem ao menos 42) e facilita enumeração.

A ID-01 deu a todos os modelos expostos uma coluna `publicId` (UUID v4, única, gerada pelo banco). Esta decisão define como a API passa a usá-la.

## Decisão

1. **Rotas** recebem o `publicId`:
   - `/api/categories/:publicId`
   - `/api/products/:publicId`
   - `/api/auth/users/:publicId`
   - `/api/stock/product/:produtoPublicId`
   - `/api/orders/:publicId/status` e `/api/orders/mine/:publicId`, que já usavam o `publicId`

   O id interno, mesmo correto, responde 404.
2. **Respostas** expõem `publicId` e referências com sufixo `PublicId`: `categoriaPublicId`, `factoryPublicId`, `produtoPublicId` e `pedidoPublicId`. Nenhum campo leva o id inteiro.
3. **Entradas** que referenciam outro recurso usam o `publicId`:
   - `categoriaPublicId`, no produto e no filtro de produtos;
   - `factoryPublicId`, no pedido e no carrinho. É opcional: sem ele, vale a fábrica padrão; com um valor que não seja de fábrica, a resposta é 400;
   - `orderPublicId`, na cobrança.
4. **Token JWT** carrega o `publicId` do usuário no lugar do `id`. O guard recusa (401) um token sem `publicId`.
5. **Consultas** resolvem o `publicId` dentro da própria cláusula, com junção ou subconsulta, sem uma busca separada antes. Para o usuário autenticado, usa-se `usuarioPorPublicId("$n")` (`src/utils/identidade.ts`).
6. O **id interno** continua como chave primária e alvo das chaves estrangeiras. Ele só circula dentro do servidor, por exemplo entre duas escritas da mesma requisição.
7. Os designs já usam como `id` um UUID gerado pelo servidor (BOLA-04) e não mudam.

## Consequências

- **Sessões antigas expiram no deploy.** Tokens emitidos antes da mudança não têm `publicId` e passam a receber 401. Cada usuário precisa entrar de novo uma vez.
- **O contrato da API muda.** Clientes que usam `id`, `factoryId`, `categoria_id` ou `orderId` precisam migrar. Neste PR, o frontend recebeu só o necessário para não quebrar:
  - catálogo da loja;
  - painéis de fábrica e staff, que agora mostram como número do pedido os 8 primeiros caracteres do `publicId`;
  - carrinho;
  - cobrança.

  O restante (URLs, chaves de `localStorage` e o fluxo de ponta a ponta) é a ID-03 (#29).
- **O gateway recebe o `publicId`.** A AbacatePay recebe o `publicId` do pedido como `externalId`. A conciliação do webhook continua pelo `billingId`.
- **Erros de banco inalcançáveis pela API.** Uma fábrica ou categoria inexistente não chega mais ao banco como violação de chave estrangeira; vira 400 antes da escrita. Os testes de mapeamento de erros do banco passaram a simular o erro do driver.
- **Cobertura.** `tests/integration/sem-id-sequencial.test.ts` percorre o fluxo completo da API e falha se qualquer campo de identificador de qualquer resposta, ou do payload do token, trouxer um inteiro.
