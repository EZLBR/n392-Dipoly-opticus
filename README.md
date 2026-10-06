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
│   └── src/         # app, config, controllers, middlewares, services e repositories
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

O backend usa Express 5 com TypeScript em modo estrito. A aplicação Express
fica em `src/app.ts`, separada do listener e ciclo de vida em `src/server.ts`.

### 1. Configurar o banco

Copie `backend/.env.example` para `backend/.env` e ajuste a `DATABASE_URL`:

```dotenv
DATABASE_URL="postgresql://user:password@localhost:5432/opticus_db?schema=public"
```

> O `DATABASE_URL` é obrigatório e é a única fonte usada pelo Prisma para
> migrações e pelo pool de conexões em tempo de execução.

### 2. Aplicar o schema (migrations)

O schema do banco é gerenciado **exclusivamente por Prisma Migrate**.
Depois de instalar dependências, aplique as migrations:

```bash
cd backend
npm install
npm run prisma:generate
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
npm run prisma:generate
npm start
npx prisma migrate deploy
npx prisma db seed
```

Consulte [backend/.env.example](backend/.env.example) para configurar PostgreSQL, JWT, CORS e integrações.

## Docker

Imagens de produção para o backend e o frontend. A orquestração com o
PostgreSQL (Docker Compose) fica na DEVOPS-02.

| Imagem | Build | Conteúdo |
| --- | --- | --- |
| API | `docker build -t opticus-backend ./backend` | Node, dependências de produção e `dist/`. Sem CLI do Prisma, compilador ou testes |
| Migrations | `docker build --target migrate -t opticus-backend-migrate ./backend` | CLI do Prisma, migrations e seeds |
| Frontend | `docker build -t opticus-frontend ./frontend` | nginx sem privilégios servindo o build do Vite |

Os processos rodam com usuário não-root. **Nenhum segredo entra nas imagens:**
variáveis sensíveis são fornecidas na execução.

### Backend

Crie um arquivo de ambiente **fora do controle de versão**:

```dotenv
# backend.env — não versionar
DATABASE_URL=postgresql://usuario:senha@host.docker.internal:5432/opticus_db
JWT_SECRET=troque-por-um-segredo-longo-e-aleatorio
FRONTEND_URL=http://localhost:8080
```

As migrations são um passo próprio, executado antes da API — nunca no boot:

```bash
docker run --rm --env-file backend.env opticus-backend-migrate
```

Seed opcional, com a mesma imagem:

```bash
docker run --rm --env-file backend.env opticus-backend-migrate npx prisma db seed
```

Depois, a API:

```bash
docker run -d --name opticus-api -p 5000:5000 --env-file backend.env opticus-backend
```

| Variável | Obrigatória | Observação |
| --- | --- | --- |
| `DATABASE_URL` | sim | a API não sobe sem ela |
| `JWT_SECRET` | sim | a API não sobe sem ela |
| `FRONTEND_URL` | não | origem liberada no CORS; padrão `http://localhost:5173` |
| `PORT` | não | padrão `5000` |
| `ABACATE_TOKEN` | não | sem ela, o pagamento roda em modo simulado |

> **Banco na própria máquina:** dentro do container, `localhost` é o próprio
> container. No Windows e no macOS, use `host.docker.internal` no lugar de
> `localhost` na `DATABASE_URL`.
>
> **CORS:** o frontend em container é servido em `http://localhost:8080`.
> Sem `FRONTEND_URL=http://localhost:8080`, a API recusa as requisições dele.

A imagem declara um `HEALTHCHECK` sobre `/health`; o estado aparece em `docker ps`.

### Frontend

O endereço da API é embutido no bundle **durante o build**:

```bash
docker build --build-arg VITE_API_URL=http://localhost:5000/api -t opticus-frontend ./frontend
docker run -d --name opticus-web -p 8080:8080 opticus-frontend
```

Acesse `http://localhost:8080`. Rotas do React Router abertas direto pela URL
são servidas pelo `index.html`.

> `VITE_API_URL` vai parar no JavaScript entregue ao navegador: trocar o endereço
> exige gerar nova imagem. **Nunca** passe segredos em variáveis `VITE_*` nem em
> `--build-arg` — ficam gravados na imagem e no histórico dela.

### Verificação na esteira

O job **Imagens Docker** do CI constrói as três imagens e as executa de verdade:
aplica as migrations pela imagem `migrate`, sobe a API e faz cadastro e login
passando pelo Prisma, sobe o frontend e verifica o fallback de SPA, os cabeçalhos
de segurança, o usuário não-root e a ausência de segredos e arquivos `.env`.

## Segurança

- autorização de objetos deve ocorrer no backend para prevenir BOLA/IDOR;
- erros da futura API padronizada devem seguir RFC 9457;
- somente arquivos `.env.example` podem ser versionados;
- SQLite, arquivos `.db`, WAL e journals são ignorados;
- credenciais anteriormente expostas não podem ser reutilizadas.

As decisões e critérios estão detalhados em [docs/security](docs/security/README.md) e [docs/api](docs/api/README.md).
