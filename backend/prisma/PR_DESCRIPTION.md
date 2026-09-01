# DB-02 · Bloco 2: Prisma Migrations como único mecanismo de evolução do schema

> **Como usar este arquivo:** é o texto da descrição do PR, mantido versionado no
> branch. Cole na descrição do PR no GitHub. Qualquer alteração futura deve
> atualizar este arquivo junto.

## Resumo

Este PR faz o corte definitivo: **as migrations do Prisma passam a ser o único
mecanismo de evolução do schema**, e o DDL de boot (`initializeDatabase` em
`db.ts`) deixa de existir. Um banco novo agora é reconstituído com
`prisma migrate deploy` + `prisma db seed`, nunca com DDL em runtime.

## 1. Dívida técnica do Bloco 1 resolvida

O `afterAll` de `tests/integration/prisma-read.test.ts` chamava
`initializeDatabase()` para restaurar o schema legado, porque outros testes
(smoke) dependiam das tabelas criadas no boot.

**Como foi resolvido:**

- `tests/setup/global-setup.ts` agora aplica o schema via `prisma migrate deploy`
  (antes chamava `initializeDatabase()`). Esse era o único ponto que criava o
  schema para a suíte de integração.
- `tests/integration/prisma-read.test.ts` **não usa mais** `prisma db push
  --accept-data-loss` (o `global-setup` cuida disso) nem restaura o schema
  legado no `afterAll` — o `afterAll` agora só desconecta o `PrismaClient`.
- Nenhum teste (smoke, unit ou integration) depende mais de
  `initializeDatabase()`.

## 2. Migration inicial

**Local:** `prisma/migrations/20260901133803_init/migration.sql`

Contém:

- **4 enums** (`Role`, `PedidoStatus`, `MetodoPagamento`, `StatusPagamento`),
  espelhando os valores literais das colunas `VARCHAR` + CHECK legadas
  (inclusive os `@map` de espaço: `'Pending Payment'`, `'In production'`).
- **8 tabelas** (`categorias`, `usuarios`, `produtos`, `pedidos`, `pedido_itens`,
  `estoque`, `pagamentos`, `saved_designs`) com as colunas e tipos do
  `schema.prisma` do Bloco 1.
- **Índices e UNIQUE** replicados 1:1 do legado (os 10 `idx_*` + `usuarios.email`
  + `estoque.produto_id`), mais os aditivos `publicId @unique` do Bloco 1 e o
  `categorias_nome_key` (novo índice de unicidade, ver §Seed).
- **8 FKs** com o `onDelete`/`onUpdate` decidido no Bloco 1: `Cascade` em
  `onUpdate` nas FKs herdadas (padrão Prisma) e `onDelete` herdado do original
  (`SetNull` em `produtos_categoria`/`pedidos_fabrica`, `Restrict` em
  `pedido_itens_produto`, `Cascade` nas demais). Verificado no banco via
  `pg_get_constraintdef`.

**Ajuste pontual:** as colunas `publicId` ganharam `DEFAULT gen_random_uuid()`
no `migration.sql`. Isso é necessário porque os controllers atuais usam SQL cru
(camada `pg`) via `INSERT INTO usuarios (...)`, que não setava `publicId` — sem o
default no banco, a coluna `NOT NULL` quebrava o registro. O `@default(uuid())`
do Prisma só vale para o client Prisma, não para o SQL cru.

## 3. `initializeDatabase` e DDL de boot removidos

- `initializeDatabase()` foi removido de `backend/src/config/db.ts`
  (antes linhas 54–248). O arquivo agora contém **apenas o pool de conexão**.
- `server.ts` não chama mais `initializeDatabase()` no boot (antes linha 21).
- O `createIndexIfNotExists()` (ajudante do DDL antigo) foi removido junto.
- Confirmado via `grep -r "initializeDatabase" backend/src` — sem referências.

O boot da aplicação agora **não executa nenhum DDL**; o schema é responsabilidade
das migrations, rodadas como passo próprio do deploy/CI.

## 4. Validação de ambiente limpo

Simulei um ambiente novo do zero com um Postgres 16 vazio (container efêmero):

```bash
docker run --rm -d -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/postgres" npx prisma migrate deploy
```

Resultado: `Applying migration 20260901133803_init` → `All migrations have been
successfully applied`. As 8 tabelas + `_prisma_migrations` foram criadas; a
aplicação subiu (boot completo) apontando para esse banco sem nenhum erro de
tabela/coluna faltante.

## 5. Seed

**Estratégia produção vs. desenvolvimento — dois arquivos:**

| Arquivo | Comando | Conteúdo | Seguro p/ produção? |
|---|---|---|---|
| `prisma/seed.ts` | `npx prisma db seed` | Dados de referência (categorias) + usuário staff **opcional** via env | ✅ Sim |
| `prisma/seed.dev.ts` | `npm run seed:dev` | Dados fake (usuários, produtos, pedidos de exemplo) | ❌ Não |

**Segurança em produção (regra crítica):**
- O `seed.ts` **não cria nenhuma senha ou conta administrativa padrão**. Não há
  senha hardcoded, nem mesmo placeholder.
- O usuário staff é criado **somente** se `SEED_ADMIN_EMAIL` e
  `SEED_ADMIN_PASSWORD_HASH` estiverem definidas no ambiente. Sem essas variáveis
  o seed **pula** a criação (logado como "Pulando criação de usuário staff
  admin"). Não há valor default tipo `admin`/`admin123`.

**Idempotência:** todos os registros usam `upsert` (nunca `create`). Os endpoints
de unicidade usados: `Categoria.nome` e `Usuario.email`. Testado rodando
`npx prisma db seed` **duas vezes seguidas** no mesmo banco: a segunda execução
não gera erro nem duplica dados (4 categorias e 1 usuário após 2 runs).

> **Nota:** foi adicionado `@unique` em `Categoria.nome` no `schema.prisma`.
> O schema original não tinha chave natural única em `Categorias`, então o
> `upsert` idempotente não teria onde ancorar. Esse índice é aditivo e
> consistente com os dados (os 4 nomes já eram distintos).

**Registro no `package.json`:**

```json
"prisma": { "seed": "node --import tsx prisma/seed.ts" }
```

(o projeto é ESM e usa `tsx`, não `ts-node` — que não é dependência.)

## 6. `schema.sql` e `migrate.ts` — decisão

Decidimos **marcar como legados** (não remover), movendo para `legacy/`:

- `backend/src/config/schema.sql` → `legacy/src/config/schema.sql`
- `backend/src/scripts/migrate.ts` → `legacy/src/scripts/migrate.ts`

**Por quê:** ambos têm valor histórico/rollback (documentam o schema original e
o antigo runner de migração SQL) e não há custo de runtime, já que nenhum código
de produção ou teste os referencia mais. Cada arquivo recebeu um cabeçalho
explícito: "LEGADO — não é mais a fonte de verdade do schema desde 2026-09-01.
Ver `prisma/schema.prisma` e `prisma/migrations/`."

Confirmado com `grep -r "schema.sql"` / `grep -r "migrate.ts"` que nenhum código
de runtime ou teste os executa. A pasta `backend/migrations/` (usa do antigo
`migrate.ts`) também foi removida; o diretório de migrations agora é
`prisma/migrations/`.

## 7. README e `.env.example`

**README** reescrito na seção de setup/desenvolvimento do backend: PostgreSQL
14+ obrigatório, como configurar `DATABASE_URL`, como rodar migrations
(`npx prisma migrate deploy` em prod/CI, `npx prisma migrate dev` em dev), como
rodar o seed e a diferença entre seed de produção e de desenvolvimento.

**`.env.example`** agora inclui:
- `DATABASE_URL` com valor **claramente fake**:
  `postgresql://user:password@localhost:5432/opticus_db?schema=public`
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD_HASH` **comentadas e vazias** (nunca
  com valor real), documentando que servem para o seed criar o usuário staff.

## 8. Restauração do zero — validação final (executada e documentada)

Simulei um banco **completamente novo e vazio** (Postgres 16 em container
efêmero, `docker run --rm -d -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16`)
e rodei o fluxo exato de um ambiente novo:

```bash
# 1. Banco novo, vazio (sem tabelas) — acima

# 2. Aplicar migrations
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/postgres" npx prisma migrate deploy
# → Applying migration 20260901133803_init ... All migrations applied.
# → 8 tabelas criadas (categorias, usuarios, produtos, pedidos, pedido_itens,
#     estoque, pagamentos, saved_designs) + _prisma_migrations

# 3. Seed
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/postgres" npx prisma db seed
# → categorias garantidas; usuário staff pulado (env ausente) — comportamento esperado

# 4. Subir a aplicação apontando para esse banco
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/postgres" PORT=5099 node --import tsx src/server.ts
# → "🚀 OPTICUS Backend rodando na porta 5099" — boot limpo, sem erro de schema

# 5. Fluxo real de leitura/escrita via API
curl http://localhost:5099/health                          # → { success: true }
curl http://localhost:5099/api/categories                  # → 4 categorias semeadas lidas
curl -X POST .../api/auth/register {clean@exemplo.com}     # → 201, token emitido (escrita)
curl .../api/auth/me -H "Authorization: Bearer <token>"    # → perfil do usuário (leitura)
```

**Leitura/escrita reais confirmadas:** registro de usuário (escrita no banco
novo) gerou `publicId` via default do banco — provando que o banco reconstituído
do zero é funcionalmente equivalente ao legado, inclusive para o SQL cru dos
controllers.

## Verificação

- `npm run typecheck` — OK (tsconfig + tsconfig.test).
- `npm test` — 16 testes (8 unit + 8 integration) — OK. O `globalSetup` aplica
  `prisma migrate deploy` no banco de teste antes da suíte.
- `prisma migrate deploy` em banco vazio (dev e teste) — OK.
- `prisma db seed` duas vezes no mesmo banco — idempotente, sem duplicar.
- Restauração do zero executada e documentada (seção 8).

## Checklist final

- [x] Migration inicial do Prisma para PostgreSQL gerada e versionada
- [x] `initializeDatabase` e qualquer DDL executado no boot removidos
- [x] Ambiente limpo sobe com `prisma migrate deploy`
- [x] Seed em `prisma/seed.ts`, seguro e idempotente
- [x] Seed de produção não cria senha ou conta administrativa padrão
- [x] `schema.sql` e `migrate.ts` explicitamente marcados como legados
- [x] README e `.env.example` documentam PostgreSQL, `DATABASE_URL`, migration e seed
- [x] Restauração do banco do zero validada e documentada
