# Opticus

Plataforma web para criação, visualização e comercialização de óculos personalizados.

O projeto usa a mesma separação adotada no Vortex Marketplace: frontend e backend independentes, ambos em TypeScript.

## Estrutura

```text
.
├── frontend/        # React, Vite, Three.js e MediaPipe
│   ├── public/
│   └── src/
├── backend/         # Express 5, Prisma e PostgreSQL
│   ├── prisma/      # Configuração inicial; modelos entram nas próximas issues
│   └── src/         # app, servidor e camadas da aplicação
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

- Node.js 22.12 ou superior
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

O backend novo usa Express 5 com TypeScript estrito. O Prisma Client é gerado
durante `npm install`, mas esta fundação ainda não contém modelos de domínio nem
executa migrations. O servidor não cria ou altera tabelas durante o boot.

```bash
cd backend
npm install
copy .env.example .env
# Edite .env e configure DATABASE_URL, JWT_SECRET e FRONTEND_URL.
npm run prisma:generate
npm run dev
```

No Linux ou macOS, use `cp .env.example .env` no lugar de `copy`.

Comandos disponíveis:

```bash
npm run dev
npm run typecheck
npm run build
npm run prisma:generate
npm start
```

O comando legado `npm run migrate` não faz parte do fluxo do backend novo e não
é necessário para iniciar a API. Consulte
[backend/.env.example](backend/.env.example) para configurar PostgreSQL, JWT,
CORS e integrações.

## Segurança

- autorização de objetos deve ocorrer no backend para prevenir BOLA/IDOR;
- erros da futura API padronizada devem seguir RFC 9457;
- somente arquivos `.env.example` podem ser versionados;
- SQLite, arquivos `.db`, WAL e journals são ignorados;
- credenciais anteriormente expostas não podem ser reutilizadas.

As decisões e critérios estão detalhados em [docs/security](docs/security/README.md) e [docs/api](docs/api/README.md).
