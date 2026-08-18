# Opticus

Plataforma web para criação, visualização e comercialização de óculos personalizados.

O projeto usa a mesma separação adotada no Vortex Marketplace: frontend e backend independentes, ambos em TypeScript.

## Estrutura

```text
.
├── frontend/        # React, Vite, Three.js e MediaPipe
│   ├── public/
│   └── src/
├── backend/         # Express e PostgreSQL
│   ├── migrations/
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

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

Comandos disponíveis:

```bash
npm run typecheck
npm run build
npm run migrate
npm start
```

Consulte [backend/.env.example](backend/.env.example) para configurar PostgreSQL, JWT, CORS e integrações.

## Segurança

- autorização de objetos deve ocorrer no backend para prevenir BOLA/IDOR;
- erros da futura API padronizada devem seguir RFC 9457;
- somente arquivos `.env.example` podem ser versionados;
- SQLite, arquivos `.db`, WAL e journals são ignorados;
- credenciais anteriormente expostas não podem ser reutilizadas.

As decisões e critérios estão detalhados em [docs/security](docs/security/README.md) e [docs/api](docs/api/README.md).
