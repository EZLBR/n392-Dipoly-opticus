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

### Studio: textos na armação

Abra o Studio e selecione **04 — Arte**. É possível adicionar até seis textos
de até 24 caracteres na frente ou nas hastes, ajustar fonte, cor, posição,
tamanho e rotação. As lentes não recebem arte.

Ao salvar conectado, a configuração completa é persistida na conta. Sem
conexão, o design fica identificado como local; edições locais pendentes não
são descartadas pela sincronização. Ao sair ou trocar de conta, o workspace
privado é limpo. Uma troca de sessão em outra aba exige recarregar o Studio.
Caches antigos sem identidade são descartados para não expor designs a outra
conta; rascunhos identificados como anônimos podem acompanhar o primeiro login.

A arte é uma prévia conceitual: a compra de designs com texto permanece
bloqueada no frontend e na API até a validação do processo pela fábrica.
Imagens, desenhos livres e aplicação sobre lentes não fazem parte desta etapa.

**Atualização do banco:** aplique as migrations antes de iniciar a nova API
(`npx prisma migrate deploy`). A migration
`20261014223000_studio_config` adiciona apenas uma coluna JSONB opcional;
designs legados sem esse documento continuam legíveis. O checkout simulado
é carregado por requisição autenticada e mostra somente pedidos da conta.

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

### 5. Pagamentos e simulador

Com `ABACATE_TOKEN` configurado, o checkout cria a cobrança no AbacatePay. Sem ele, o
checkout aponta para um **simulador de pagamento** embutido na API, que confirma a
cobrança sem dinheiro real.

O simulador só existe fora de produção. Com `NODE_ENV=production`, as rotas
`GET /api/payments/simulated-checkout` e `POST /api/payments/confirm-simulated-payment`
**não são registradas** e respondem 404, igual a qualquer rota inexistente. Assim, ninguém
confirma um pagamento sem pagar no ambiente real, mesmo se o token do gateway faltar.

| `NODE_ENV` | Simulador |
| --- | --- |
| `development` (padrão do `npm run dev`) | disponível |
| `test` | disponível, para os testes de integração |
| `production` (imagem Docker e Compose) | inexistente, responde 404 |

O simulador só cobre a **falta** de um token real. Com `ABACATE_TOKEN` real configurado, uma
falha do gateway **nunca** cai no simulador, em nenhum ambiente: `POST /api/orders/checkout-cart`
e `POST /api/payments/create-billing` respondem conforme o resultado da cobrança.

| Resultado do gateway | Resposta | Pedidos |
| --- | --- | --- |
| `ABACATE_TOKEN` ausente, em produção | 503 "nenhuma cobrança foi criada" | nenhum é criado ou alterado |
| Recusou a cobrança (4xx) | 503 "nenhuma cobrança foi criada" | os da tentativa são desfeitos (checkout); o pedido não muda (create-billing) |
| Sem resposta conclusiva (timeout de 10 s, rede, resposta ilegível, qualquer 5xx) | 503 "não foi possível confirmar" | ficam pendentes: a cobrança pode existir |
| Criou a cobrança, mas outra cobrança assumiu o pedido no meio do caminho | 409 | nenhum é vinculado à cobrança nova |
| Criou a cobrança, mas a gravação falhou | 500, com registro no log para conciliação | preservados |

O desfazimento e o vínculo só alteram pedidos da tentativa que ainda têm o billingId
provisório dela, e o vínculo é tudo ou nada. No `create-billing`, o vínculo e o registro do
pagamento pendente são uma transação só. A classificação da resposta fica em
`backend/src/services/gatewayDePagamento.ts`.

## Docker

Imagens de produção para o backend e o frontend. Para subir a stack completa, com o
PostgreSQL, use o Docker Compose (abaixo).

| Imagem | Build | Conteúdo |
| --- | --- | --- |
| API | `docker build -t opticus-backend ./backend` | Node, dependências de produção e `dist/`. Sem CLI do Prisma, compilador ou testes |
| Migrations | `docker build --target migrate -t opticus-backend-migrate ./backend` | CLI do Prisma, migrations e seeds |
| Frontend | `docker build -t opticus-frontend ./frontend` | nginx sem privilégios servindo o build do Vite |

Os processos rodam com usuário não-root. **Nenhum segredo entra nas imagens:**
variáveis sensíveis são fornecidas na execução.

### Stack completa com Docker Compose

Sobe PostgreSQL, migrations, API e frontend com um comando:

```bash
cp .env.example .env
docker compose up --build
```

Antes de subir, preencha no `.env` os dois valores obrigatórios, `POSTGRES_PASSWORD` e
`JWT_SECRET`. Sem eles o Compose **recusa a subida** e diz o que falta. Para gerar
valores aleatórios:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

| Serviço | Endereço no host | Função |
| --- | --- | --- |
| `db` | `127.0.0.1:5433` | PostgreSQL 16, com dados no volume persistente `pgdata` |
| `migrate` | — | aplica as migrations e o seed de referência, e termina |
| `api` | `http://localhost:5000` | backend; saúde em `/health` |
| `web` | `http://localhost:8080` | frontend |

Ordem de subida: `db` saudável → `migrate` conclui → `api` saudável → `web`. Dentro da
rede do Compose os serviços se enxergam pelo nome — a API conecta em `db:5432`, nunca
em `localhost`.

A API do Compose roda com `NODE_ENV=production`, então o simulador de pagamento não
existe nela (veja [Pagamentos e simulador](#5-pagamentos-e-simulador)). Sem
`ABACATE_TOKEN`, o checkout fica sem onde pagar. Para testar o fluxo de compra na sua
máquina, defina `API_NODE_ENV=development` no `.env`. Nunca faça isso num ambiente
acessível por outras pessoas.

As portas são configuráveis no `.env` (`API_PORT`, `WEB_PORT`, `DB_PORT`) e são
publicadas só em `127.0.0.1`. O banco usa a **5433** para não colidir com um PostgreSQL
já instalado na 5432; para abri-lo no pgAdmin, conecte em `localhost:5433` com o
usuário e a senha do `.env`.

```bash
docker compose up --build -d --wait   # sobe em segundo plano e espera tudo ficar saudável
docker compose ps                     # estado dos serviços
docker compose logs -f api            # acompanhar a API
docker compose down                   # encerra e MANTÉM os dados
docker compose down -v                # encerra e APAGA o banco
```

Depois de alterar código, rode `docker compose up --build` para reconstruir as imagens.
Mudar `API_PORT` também exige rebuild, porque o endereço da API é embutido no frontend.

**Dados de exemplo (opcional, só local):**

```bash
docker compose run --rm migrate npm run seed:dev
```

> Cria `cliente@exemplo.invalid` e `fabrica@exemplo.invalid` com uma **senha fixa e
> pública** (está no código e aparece no log). Use só na sua máquina; nunca num
> ambiente acessível por outras pessoas.

As seções abaixo descrevem o uso de cada imagem isoladamente, sem o Compose.

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
