# DB-01 · Bloco 1: Prisma como fonte de verdade do schema

> **Como usar este arquivo:** é o texto da descrição do PR, mantido versionado no
> branch. Cole na descrição do PR no GitHub. Qualquer alteração futura deve
> atualizar este arquivo junto.

## Resumo

Este PR introduz o Prisma como fonte de verdade do schema do banco (Bloco 1).
O arquivo `backend/prisma/schema.prisma` espelha o schema PostgreSQL legado
(`backend/src/config/schema.sql` e o DDL de boot de `backend/src/config/db.ts`),
com as extensões definidas nos critérios de aceite:

- **publicId** em todo recurso exposto via API
  (`Usuario`, `Produto`, `Pedido`, `SavedDesign`), com `@unique`.
- **Concurrency tokens** (`version`) em `Pedido` e `Estoque`.
- Tipagem rica via **enums** (`Role`, `PedidoStatus`, `MetodoPagamento`,
  `StatusPagamento`) no lugar de `VARCHAR` + CHECK.

Fica fora deste PR (Bloco 2): `db.ts`, `schema.sql` e `migrate.ts` permanecem
intocados. A integração do Prisma no sistema (trocas de queries, migrations,
remoção do DDL legado) virá no Bloco 2.

## O que mudou

| Arquivo | Mudança |
|---|---|
| `backend/prisma/schema.prisma` | Novo — schema Prisma completo, fonte de verdade |
| `backend/prisma/PR_DESCRIPTION.md` | Este arquivo (descrição do PR versionada) |
| `backend/tests/integration/prisma-read.test.ts` | Novo — testes de leitura via Prisma contra o banco real |
| `backend/prisma.config.ts` | Novo — configuração do Prisma CLI |
| `backend/package.json` / `backend/.env.example` | Adiciona `prisma` e `@prisma/client`; `DATABASE_URL` preenchida |
| `backend/.env.test.example` | Documenta a obrigatoriedade de banco `_test` |

## 1. Recursos Expostos e `publicId`

Todo modelo exposto como recurso da API tem `publicId String @unique
@default(uuid())`:

- `Usuario` → `publicId`
- `Produto` → `publicId`
- `Pedido` → `publicId`
- `SavedDesign` → `publicId`

### Como `Usuario` representa clientes **e** fábricas (substitui a frase solta anterior)

`Usuario` é a tabela única que representa os dois papéis de negócio, distinguidos
pelo enum `Role` (`client`, `factory`, `staff`). Isso herda o desenho do banco
original: `usuarios.role` é um `VARCHAR(50)` com CHECK
`('client','factory','staff')`, e tanto compradores quanto fábricas vivem nessa
mesma tabela (fábrica também tem `factory_name`).

`Pedido` é o único modelo com **duas relações para a mesma tabela** `Usuario`:

- **Comprador** → `Pedido.usuarioId` (relação `"UsuarioPedidos"`), **obrigatória**:
  todo pedido tem um comprador, e a FK vem de `pedidos.usuario_id`.
- **Fábrica responsável** → `Pedido.factoryId` (relação `"FactoryPedidos"`),
  **opcional**: `pedidos.factory_id` pode ser `NULL` em pedidos ainda não
  atribuídos a uma fábrica (o `orderController` cai para a primeira fábrica com
  `role = 'factory'` quando recebe um `factoryId` inválido).

```
Usuario ──1:N──> Pedido (comprador)   @relation("UsuarioPedidos")
Usuario ──1:N──> Pedido (fábrica)     @relation("FactoryPedidos")
```

As duas relações têm **nomes de relação distintos e explícitos** no `schema.prisma`
(`"UsuarioPedidos"` e `"FactoryPedidos"`), o que elimina qualquer ambiguidade para
o Prisma e para o banco ao gerar as FKs. No lado `Pedido`:

- `usuario  Usuario  @relation("UsuarioPedidos", fields: [usuarioId], references: [id], onDelete: Cascade)`
- `fabrica  Usuario? @relation("FactoryPedidos", fields: [factoryId], references: [id], onDelete: SetNull)`

A mesma tabela única também sustenta `SavedDesign.usuarioId`, que aponta para o
comprador cliente que salvou o design.

### Divergência de `SavedDesign` (documentada)

O `schema.sql` define `saved_designs.id` como `SERIAL PRIMARY KEY`, mas o
`db.ts` (DDL de boot, que é o que o servidor realmente executa e fica em uso)
define `id VARCHAR(255) PRIMARY KEY`. Seguimos o **`db.ts`**, que é a fonte do
comportamento real do sistema: `SavedDesign.id` é `String @id @db.VarChar(255)`.
O `schema.sql` está desatualizado nesse ponto; o `migrate.ts` não mexe nessa
tabela via migração SQL (não há arquivos em `migrations/`). A divergência fica
registrada para o Bloco 2 reconciliar o `schema.sql` com a realidade.

## Exceção ao critério: `Produto` é catálogo global (sem dono)

> **Decisão:** `Produto` NÃO ganhou FK de proprietário. O critério exige
> `publicId` + relação explícita com usuário/fábrica dona; aqui só o `publicId`
> faz sentido, e a ausência de dono é uma **exceção consciente e justificada**,
> não uma lacuna do schema.

**Onde procurei e não achei vínculo produto→fábrica:**

- `src/controllers/productController.ts` — CRUD completo de produtos. O
  `INSERT` grava apenas `nome, descricao, preco, categoria_id, imagem_url`.
  Não há coluna de dono, nem join, nem filtro por fábrica/usuário.
- `src/controllers/stockController.ts` e `src/controllers/categoryController.ts`
  — todos os `JOIN`s envolvem `produtos`, `categorias` e `estoque`; nenhum toca
  `usuarios`.
- `src/controllers/orderController.ts` — o único `factory_id` do sistema vive
  em **pedidos** (`fk_pedido_fabrica`), não em produtos.
- DDL de boot (`src/config/db.ts:84-97`) e `src/config/schema.sql:41-56` —
  a tabela `produtos` não tem `factory_id` nem FK para `usuarios/categorias`
  (`fk_produto_categoria` vai só para `categorias`).
- Busca por tabela pivot (`produto_fabrica`, `product_factory`) — não existe
  nenhuma.

**Conclusão:** no domínio atual, o catálogo de produtos é global: qualquer
fábrica `staff/factory` pode criar um produto e ele fica visível para todos
(listagem sem filtro de dono em `GET /api/products`). A relação de "posse" hoje
acontece no momento do pedido (`pedido.factory_id`), não na definição do produto.
Adicionar uma FK em `Produto` inventaria um dono que o sistema não usa e criaria
uma coluna órfã. **Documentada como exceção ao critério de aceite; nenhuma
mudança de código.**

## 2. Índices e unicidade

Conferi campo a campo `db.ts:54-188` e `schema.sql` contra o `schema.prisma`.
**Nenhum índice ou UNIQUE do SQL original ficou sem equivalente.** Lista explícita:

**Índices replicados (10/10):**

| Índice SQL original | Equivalente no Prisma |
|---|---|
| `idx_produtos_categoria` ON `produtos(categoria_id)` | `@@index([categoriaId], map: "idx_produtos_categoria")` em `Produto` |
| `idx_pedidos_usuario` ON `pedidos(usuario_id)` | `@@index([usuarioId], map: "idx_pedidos_usuario")` em `Pedido` |
| `idx_pedidos_factory` ON `pedidos(factory_id)` | `@@index([factoryId], map: "idx_pedidos_factory")` em `Pedido` |
| `idx_pedidos_status` ON `pedidos(status)` | `@@index([status], map: "idx_pedidos_status")` em `Pedido` |
| `idx_pedidos_billing` ON `pedidos(abacate_billing_id)` | `@@index([abacateBillingId], map: "idx_pedidos_billing")` em `Pedido` |
| `idx_itens_pedido` ON `pedido_itens(pedido_id)` | `@@index([pedidoId], map: "idx_itens_pedido")` em `PedidoItem` |
| `idx_itens_produto` ON `pedido_itens(produto_id)` | `@@index([produtoId], map: "idx_itens_produto")` em `PedidoItem` |
| `idx_pagamentos_pedido` ON `pagamentos(pedido_id)` | `@@index([pedidoId], map: "idx_pagamentos_pedido")` em `Pagamento` |
| `idx_designs_usuario` ON `saved_designs(usuario_id)` | `@@index([usuarioId], map: "idx_designs_usuario")` em `SavedDesign` |
| `idx_designs_email` ON `saved_designs(customer_email)` | `@@index([customerEmail], map: "idx_designs_email")` em `SavedDesign` |

**UNIQUE / UNIQUE INDEX replicados:**

| Constraint SQL original | Equivalente no Prisma |
|---|---|
| `usuarios.email UNIQUE` | `email String @unique` em `Usuario` |
| `estoque.produto_id UNIQUE` | `produtoId Int @unique` em `Estoque` |

**Nota sobre `PedidoItem`:** o SQL original **não** tem índice composto
`(pedido_id, produto_id)` — apenas os dois índices simples acima, que foram
replicados. Não há `@@unique([pedidoId, produtoId])` a migrar porque ele não
existe no banco legado.

**Índices/unicidade novos aditivos (do Bloco 1, não existiam no SQL):**
`publicId @unique` em `Usuario`, `Produto`, `Pedido` e `SavedDesign`; nenhum
UNIQUE/índice existente foi removido.

## 3. `onDelete` / `onUpdate` das foreign keys

Releitura campo a campo do SQL original. Todas as 12 FKs do sistema foram
cobertas (8 relações declaradas no Prisma; as 4 colunas de `publicId`/`version`
não são FK). Para cada FK: se o SQL original definia comportamento, replicamos
exatamente; onde não definia (padrão Postgres = NO ACTION), declaramos decisão.

| Relação | `onDelete` | `onUpdate` | Origem da decisão |
|---|---|---|---|
| `Produto.categoria` → `Categoria` | `SetNull` | `Cascade` | Herdado do SQL (`ON DELETE SET NULL ON UPDATE CASCADE` — única FK com `ON UPDATE` explícito) |
| `Pedido.usuario` → `Usuario` | `Cascade` | `Cascade` (padrão Prisma) | `ON DELETE CASCADE` no SQL; `ON UPDATE` não definido → padrão Prisma `Cascade` aceito (PKs SERIAL não mudam) |
| `Pedido.fabrica` → `Usuario` | `SetNull` | `Cascade` (padrão Prisma) | `ON DELETE SET NULL` no SQL; `ON UPDATE` não definido → padrão Prisma |
| `PedidoItem.pedido` → `Pedido` | `Cascade` | `Cascade` (padrão Prisma) | `ON DELETE CASCADE` no SQL (itens acompanham o pedido pai); `ON UPDATE` não definido → padrão Prisma |
| `PedidoItem.produto` → `Produto` | `Restrict` | `Cascade` (padrão Prisma) | `ON DELETE RESTRICT` no SQL; `ON UPDATE` não definido → padrão Prisma |
| `Estoque.produto` → `Produto` | `Cascade` | `Cascade` (padrão Prisma) | `ON DELETE CASCADE` no SQL (estoque é 1:1 do produto); `ON UPDATE` não definido → padrão Prisma |
| `Pagamento.pedido` → `Pedido` | `Cascade` | `Cascade` (padrão Prisma) | `ON DELETE CASCADE` no SQL; `ON UPDATE` não definido → padrão Prisma |
| `SavedDesign.usuario` → `Usuario` | `Cascade` | `Cascade` (padrão Prisma) | `ON DELETE CASCADE` no SQL; `ON UPDATE` não definido → padrão Prisma |

**Decisão deliberada sobre `onUpdate`:** o SQL original só define `ON UPDATE`
numa FK (`Produto.categoria`). Nas demais, o Postgres padronizaria NO ACTION.
Optamos por manter o **padrão do Prisma (`Cascade`) para `onUpdate`** em todas
as relações como escolha consistente — na prática é inócuo, pois todas as FKs
apontam para PKs `SERIAL` (imutáveis em operação normal), e evita que uma
renomeação de id quebre a cadeia. Nenhum caso usou `NoAction`/`Restrict` de
`onUpdate` porque o legado não dependia desse comportamento.

## 4. Enums e `@map`

Conferidos os quatro enums contra os valores literais armazenados hoje
(colunas `VARCHAR` + CHECK):

- **`PedidoStatus`** (coluna `pedidos.status`; CHECK guarda `'Pending Payment'`,
  `'Queued'`, `'In production'`, `'Delivered'`, `'Cancelled'`): as duas variantes
  com espaço usam `@map` para a string exata — `Pending_Payment @map("Pending
  Payment")` e `In_production @map("In production")`. `Queued`, `Delivered` e
  `Cancelled` coincidem 1:1 com o valor armazenado, então **não precisam** de
  `@map`. Sem esses `@map`, o Prisma gravaria `Pending_Payment` (underscore)
  como literal, quebrando leitura/escrita de dados existentes.
- **`Role`** (coluna `usuarios.role`; CHECK guarda `'client'`, `'factory'`,
  `'staff'`): as três variantes coincidem exatamente com os valores armazenados —
  **sem `@map` necessário**.
- **`MetodoPagamento`** (coluna `pagamentos.metodo`; CHECK guarda `'pix'`,
  `'cartao_credito'`, `'boleto'`): coincidem 1:1 — **sem `@map`**.
- **`StatusPagamento`** (coluna `pagamentos.status`; CHECK guarda `'pendente'`,
  `'aprovado'`, `'recusado'`, `'estornado'`): coincidem 1:1 — **sem `@map`**.

Regra geral aplicada: `@map` só onde o identificador do enum (nome da variante)
difere do literal armazenado; onde coincidem, o `@map` é desnecessário (e
evitado para não duplicar informação).

## 5. Isolamento do banco de teste

**De onde vem a `DATABASE_URL` do teste:** de `backend/.env.test`
(template versionado: `backend/.env.test.example`), carregada pelo script
`npm run test:integration`/`npm test` via `dotenv -e .env.test`. O
`tests/integration/prisma-read.test.ts` **não usa mais URL hardcoded** — deriva a
URL de `process.env.DATABASE_URL`, a mesma que o `pool` do legado usa, garantindo
que o Prisma e o `pg` apontem para o mesmo banco.

**Guarda de segurança (falha rápido):** `assertBancoDeTeste()`
(`tests/setup/db.ts`) se recusa a rodar se o nome do banco **não terminar em
`_test`**. Essa guarda já protegia o `pool` legado; agora está **também
duplicada explicitamente no `beforeAll` (antes do `prisma db push
--accept-data-loss`) e no `afterAll` (antes do `DROP SCHEMA public CASCADE`)
do teste Prisma**. Não existe cenário em que a suíte rode `db push` ou
`DROP SCHEMA` contra um banco sem o marcador `_test`. Complementando: a
`DATABASE_URL` de dev é `opticus_db` (sem `_test`) e roda num `.env` ignorado
pelo git — nunca é carregada pela suíte.

**Correção adicional de robustez:** o `afterAll` voltou a restaurar o schema
legado após o `DROP SCHEMA` (chama `initializeDatabase()`), para que os demais
arquivos de integração do mesmo run (que dependem das tabelas do legado) não
quebrem e a próxima execução comece limpa.

## Verificação

- `npx prisma format`, `npx prisma validate`, `npx prisma generate` — OK.
- `npm run typecheck` — OK.
- `npm test` (16 testes: unit + integration, incluindo `prisma-read.test.ts`) — OK.
- `.github/workflows/ci.yml` segue o mesmo para backend (typecheck + build + testes unitários).

## Fora de escopo (Bloco 2)

`db.ts`, `schema.sql`, `migrate.ts`: não tocados neste PR. A troca do legado por
migrations/Prisma e a remodelagem dos controllers para o client Prisma virão no
Bloco 2.