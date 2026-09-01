# Opticus

Plataforma web para criação, visualização e comercialização de óculos personalizados.

O projeto usa a mesma separação adotada no Vortex Marketplace: frontend e backend independentes, ambos em TypeScript.

## Estrutura

```text
.
├── frontend/        # React, Vite, Three.js e MediaPipe
│   ├── public/
│   └── src/
├── backend/         # Express + PostgreSQL (schema via Prisma Migrate)
│   ├── prisma/      # schema.prisma, migrations/ e seed
│   └── src/
├── docs/            # Arquitetura, API e segurança
├── .github/workflows/
├── .gitignore
└── .nvmrc
```

Não há código legado, backups, bancos locais ou arquivos de ambiente reais versionados.

## Branches e esteira

- `dev`: integração contínua e validação das mudanças.
- `main`: código estável destinado à produção.

A esteira do GitHub Actions executa typecheck, testes e build em pushes e pull requests para as duas branches. O fluxo esperado é trabalhar em `dev` e promover para `main` após validação.

## Requisitos

- Node.js 22
- npm
- PostgreSQL

## Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Comandos disponíveis:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

Variável pública do frontend:

```dotenv
VITE_API_URL=http://localhost:5000/api
```

## Backend

Requisitos: Node.js 22, npm e **PostgreSQL 14+**.

### 1. Configurar o banco

Copie `backend/.env.example` para `backend/.env` e ajuste a `DATABASE_URL`:

```dotenv
DATABASE_URL="postgresql://user:password@localhost:5432/opticus_db?schema=public"
```

> O `DATABASE_URL` é a fonte usada pelo Prisma para migrações e pelo pool
> de conexões em tempo de execução. As variáveis `DB_*` são usadas apenas
> se `DATABASE_URL` não estiver definida.

### 2. Aplicar o schema (migrations)

O schema do banco é gerenciado **exclusivamente por Prisma Migrate**.
Depois de instalar dependências, aplique as migrations:

```bash
cd backend
npm install
npx prisma migrate deploy   # produção / CI (aplica migrations pendentes)
# ou, durante o desenvolvimento:
npx prisma migrate dev      # cria/applica migrations e regenera o client
```

> Não há mais DDL em `db.ts` nem `schema.sql` manual: o schema evolui
> apenas via `prisma/migrations/`.

### 3. Seed

O seed insere os dados de referência necessários para o sistema funcionar:

```bash
npx prisma db seed
```

- **Produção (seed.ts):** apenas dados de referência (categorias) e,
  opcionalmente, um usuário staff inicial — somente se `SEED_ADMIN_EMAIL` e
  `SEED_ADMIN_PASSWORD_HASH` estiverem definidas no ambiente. Sem essas
  variáveis, nenhuma conta administrativa é criada. **Nunca há senha ou
  admin padrão no código.**
- **Desenvolvimento (seed.dev.ts):** dados fake (usuários, produtos e
  pedidos de exemplo). **Não rode em produção.** Execute com
  `npm run seed:dev` no backend.

### 4. Rodar a API

```bash
npm run dev    # desenvolvimento (tsx watch)
```

Comandos disponíveis (dentro de `backend/`):

```bash
npm run typecheck
npm run test
npm run test:integration
npm run build
npm start
npx prisma migrate deploy
npx prisma db seed
```

Consulte [backend/.env.example](backend/.env.example) para configurar PostgreSQL, JWT, CORS e integrações.

## Segurança

- autorização de objetos deve ocorrer no backend para prevenir BOLA/IDOR;
- erros da futura API padronizada devem seguir RFC 9457;
- somente arquivos `.env.example` podem ser versionados;
- SQLite, arquivos `.db`, WAL e journals são ignorados;
- credenciais anteriormente expostas não podem ser reutilizadas.

As decisões e critérios estão detalhados em [docs/security](docs/security/README.md) e [docs/api](docs/api/README.md).
