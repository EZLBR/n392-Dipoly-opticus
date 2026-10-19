# OPTICUS — Relatório de Levantamento de Requisitos (Findings)

> **Estágio:** levantamento prévio à redação do documento técnico.
> **Escopo desta entrega:** inventário estruturado, rastreável ao código-fonte.
> **Data do levantamento:** 2026-09-28 · **Branch:** `feat/stop-leaking-internal-errors` · **Último commit:** `694975b`
> **Regra de ouro aplicada:** toda afirmação abaixo cita `arquivo:linha`. Ausência de evidência está registrada na Seção 8 (Lacunas), nunca preenchida por suposição.

---

## Índice

1. [Introdução — Stack técnica consolidada](#1-introdução--stack-técnica-consolidada)
2. [Contexto e Justificativa — evidências e lacunas](#2-contexto-e-justificativa--evidências-e-lacunas)
3. [Objetivos — capacidades verificadas](#3-objetivos--capacidades-verificadas)
4. [Escopo e Delimitação](#4-escopo-e-delimitação)
5. [Engenharia de Requisitos — método e convenções](#5-engenharia-de-requisitos--método-e-convenções)
6. [Requisitos Funcionais (RF01–RF33)](#6-requisitos-funcionais-rf01rf33)
7. [Requisitos Não Funcionais (RNF01–RNF63)](#7-requisitos-não-funcionais-rnf01rnf63)
8. [Lacunas e pontos de incerteza](#8-lacunas-e-pontos-de-incerteza)
9. [Apêndice A — Matriz de rastreabilidade arquivo→RF](#9-apêndice-a--matriz-de-rastreabilidade-arquivorf)
10. [Apêndice B — Inventário de dados mockados](#10-apêndice-b--inventário-de-dados-mockados)

---

## 1. Introdução — Stack técnica consolidada

### 1.1 Repositório

| Item | Valor | Evidência |
|---|---|---|
| Nome do pacote raiz | `n392-Dipoly-opticus` | `package-lock.json:2` |
| Descrição funcional (fonte primária) | *"Plataforma web para criação, visualização e comercialização de óculos personalizados."* | `README.md:3` |
| Descrição do backend | *"API REST em Express e PostgreSQL para a plataforma Opticus"* | `backend/package.json:4` |
| Organização | Monorepo com 2 aplicações independentes (`frontend/`, `backend/`) + `docs/` | `docs/architecture/PROJECT_STRUCTURE.md:5-9` |
| Decisão de arquitetura registrada | ADR-0001: "Frontend e backend separados em TypeScript", status *aceito*, data 2026-08-17 | `docs/decisions/ADR-0001-frontend-backend-typescript.md:1-4` |
| Runtime | Node.js 22 (`.nvmrc` = `22`; `engines.node >= 22.0.0`) | `.nvmrc:1`, `backend/package.json:39-41` |
| Gerenciador de pacotes | npm (`package-lock.json` nos 3 níveis) | `docs/architecture/PROJECT_STRUCTURE.md:11` |

### 1.2 Backend

| Camada | Tecnologia | Versão | Evidência |
|---|---|---|---|
| Linguagem | TypeScript (ESM, `type: "module"`) | ^5.9.3 | `backend/package.json:6,55` |
| Framework HTTP | Express | ^5.2.1 | `backend/package.json:30` |
| ORM / migrações | Prisma (`@prisma/client` + CLI) | ^5.22.0 | `backend/package.json:26,47` |
| Banco de dados | PostgreSQL 14+ | — | `README.md:64`, `backend/.env.example:9` |
| Driver SQL direto | `pg` (pool de conexões) | ^8.21.0 | `backend/package.json:35`, `backend/src/config/db.ts:10-28` |
| ORM de modular (`module`) | ESM nativo + `NodeNext` | — | `backend/tsconfig.json:3-4` |
| Autenticação | `jsonwebtoken` (JWT, Bearer) | ^9.0.2 | `backend/package.json:33`, `backend/src/middlewares/auth.ts:22` |
| Hash de senha | `bcryptjs` (10 rounds) | ^2.4.3 | `backend/package.json:27`, `backend/src/services/authService.ts:69` |
| Hardening HTTP | `helmet` | ^8.2.0 | `backend/package.json:32`, `backend/src/app.ts:52-57` |
| CORS | `cors` (allowlist) | ^2.8.5 | `backend/package.json:28`, `backend/src/app.ts:38-50` |
| Rate limiting | `express-rate-limit` | ^8.5.2 | `backend/package.json:31`, `backend/src/app.ts:61-91` |
| Logs | `pino` + `pino-pretty` | ^10.3.1 / ^13.1.3 | `backend/package.json:36-37`, `backend/src/utils/logger.ts:1-17` |
| E-mail | `nodemailer` (Ethereal em runtime) | ^9.0.5 | `backend/package.json:34`, `backend/src/utils/emailService.ts:29-39` |
| Env | `dotenv` | ^16.4.5 | `backend/package.json:29`, `backend/src/config/env.ts:1-3` |
| Testes | Vitest 4 + Supertest 7 + `@vitest/coverage-v8` | ^4.1.11 / ^7.2.2 / ^4.1.11 | `backend/package.json:50-56` |
| Execução TS (dev) | `tsx` | ^4.21.0 | `backend/package.json:54`, `backend/package.json:9` |

**Ausências confirmadas no backend:** não há ESLint, Prettier, Husky, OpenAPI/Swagger, containerização (Dockerfile/docker-compose), cache (Redis), fila de jobs, Sentry/telemetria, nem biblioteca de validação de schema (Zod/Yup/AJV). Verificação: `backend/package.json:25-57` (lista completa de dependências) e ausência de qualquer Dockerfile no repositório (varredura completa de arquivos).

### 1.3 Frontend

| Camada | Tecnologia | Versão | Evidência |
|---|---|---|---|
| Linguagem | TypeScript (`strict: false`) | ^5.9.3 | `frontend/package.json:29`, `frontend/tsconfig.json:10` |
| Biblioteca UI | React + React DOM | ^19.2.6 | `frontend/package.json:16-17` |
| Roteamento | `react-router-dom` | ^7.18.2 | `frontend/package.json:18` |
| Build | Vite | ^8.0.12 | `frontend/package.json:28` |
| 3D | `three` | ^0.184.0 | `frontend/package.json:20` |
| Visão computacional / AR | `@mediapipe/tasks-vision` (FaceLandmarker) | ^0.10.35 | `frontend/package.json:14`, `frontend/src/components/creator/TryOnViewport.tsx:36-43` |
| Gráficos de dashboard | `recharts` | ^3.8.1 | `frontend/package.json:19` |
| Ícones | `lucide-react` | ^1.16.0 | `frontend/package.json:15` |
| Testes | Vitest | ^4.1.8 | `frontend/package.json:29` |
| Deploy | Vercel (rewrite SPA) | — | `frontend/vercel.json:2-7` |

**Ausências confirmadas no frontend:** sem ESLint/Prettier, sem axios (100% `fetch` nativo), sem proxy de API no Vite (`frontend/vite.config.ts:5-7`), sem biblioteca de i18n real, sem testes de componente/E2E, sem Coverage no script de teste (`frontend/package.json:10`).

### 1.4 Ambiente de teste e CI

| Item | Evidência |
|---|---|
| PostgreSQL 16 como serviço de CI, com health check `pg_isready` | `.github/workflows/ci.yml:41-54` |
| Pipeline por aplicação: `npm ci` → `prisma:generate` → `migrate` → `typecheck` → `test` → `build` | `.github/workflows/ci.yml:73-84` |
| Gatilho: push e PR em `main` e `dev` + `workflow_dispatch` | `.github/workflows/ci.yml:3-8` |
| Princípio de branches: `dev` integra/valida; `main` é estável, destinado à produção | `README.md:27-30` |
| Permissões mínimas (`contents: read`) | `.github/workflows/ci.yml:10-11` |

---

## 2. Contexto e Justificativa — evidências e lacunas

### 2.1 O que o repositório afirma sobre o problema

| # | Evidência textual | Fonte |
|---|---|---|
| E1 | *"Plataforma web para criação, visualização e comercialização de óculos personalizados."* | `README.md:3` |
| E2 | *"O projeto usa a mesma separação adotada no Vortex Marketplace: frontend e backend independentes, ambos em TypeScript."* | `README.md:5` |
| E3 | *"O projeto anterior misturava a aplicação atual, protótipos, backups e código legado. A equipe decidiu adotar a organização já utilizada no Vortex Marketplace e trabalhar somente com as branches `dev` e `main`."* | `docs/decisions/ADR-0001-frontend-backend-typescript.md:8` |
| E4 | *"Código legado e backups não fazem parte do novo repositório."* | `docs/decisions/ADR-0001-frontend-backend-typescript.md:17` |
| E5 | O README afirma, na seção de segurança, que *"erros da **futura** API padronizada devem seguir RFC 9457"* — ou seja, a API de produção era tratada como não entregue. | `README.md:138` |

### 2.2 Problema de negócio derivado da modelagem (evidência estrutural, não textual)

Os seguintes indícios são extraídos **do schema e do código**, e sustentam a hipótese de que o problema é a ausência de uma esteira digital para óculos sob encomenda com múltiplos fabricantes:

| # | Indício estrutural | Evidência |
|---|---|---|
| E6 | O pedido **não pertence a um catálogo de produtos** — carrega `productName` (texto livre) e `customSpecs` (JSON livre) em vez de FK para `Produto`. Isso indica produto sob encomenda, não e-commerce de prateleira. | `backend/prisma/schema.prisma:78,83` |
| E7 | O pedido é **despachado para uma fábrica** (`factoryId`/`factoryName`), e o ciclo de vida tem fases de produção industrial: `Pending Payment → Queued → In production → Delivered / Cancelled`. | `backend/prisma/schema.prisma:65-71,79-80` |
| E8 | A usuario tem papel `factory` com atributo `factoryName` (nome da empresa), indicando **rede de fabricantes parceiros**, não uma única ótica. | `backend/prisma/schema.prisma:21-25,33` |
| E9 | Existe entidade `SavedDesign` com parâmetros de armação (modelo, cor, solar, antirreflexo, haste, ponte, perfil, abertura de haste) e flag `published` — pertain a **catálogo de parametric eyewear**. | `backend/prisma/schema.prisma:160-184` |
| E10 | O e-mail transacional fala em "routed to [factory]" e "in production", com "artisans crafting your frame". | `backend/src/utils/emailService.ts:63-64` |
| E11 | Categorias de referência: *Óculos de Sol / Armações / Lentes / Acessórios* — taxonomia de uma **óptica** (lentes avulsas e sob medida), não de um e-commerce genérico. | `backend/prisma/seed.ts:32-37` |
| E12 | Foreign key `FactoryPedidos` entre `Usuario(role=factory)` e `Pedido` — a fábrica é um ator do sistema, tratado como fornecedor. | `backend/prisma/schema.prisma:39,92` |
| E13 | A "fábrica" é selecionada automaticamente quando não informada: `SELECT id FROM usuarios WHERE role = 'factory' LIMIT 1` — há um balanceamento de carga rudimentar de pedidos entre fábricas. | `backend/src/controllers/orderController.ts:31-33`, `backend/src/controllers/orderController.ts:229-231` |

### 2.3 Explicitamente NÃO evidenciado (lacunas de contexto — ver também Seção 8)

Não existe, em nenhum arquivo versionado, nenhuma das seguintes informações: nome comercial do produto além de "Opticus"; público-alvo ou persona; caso de uso ou cenário de dor; métrica de sucesso; prazo/valor do projeto; sponsor ou cliente do sistema; entregáveis de negocio; ou menção a ferramenta legada substituída. Verificação: leitura integral de `README.md` (143 linhas), dos 4 documentos em `docs/`, `backend/prisma/PR_DESCRIPTION.md` (202 linhas) e as 27 mensagens de commit (`git log`).

**Único indício indireto e não conclusivo:** o nome do pacote raiz é `n392-Dipoly-opticus` (`package-lock.json:2`) e o histórico tem autoria múltipla (contas distintas em `git log --format='%an'`: Enzo Brasil, gabriel65965/Gabriel Damasceno, JoaoPedroSaraivaDrummond, JoaoUbuntu, veltonmonte/VeltonMonte.dev — agrupamentos de até 5 pessoas, sem comprovação explícita). Isso é compatível com um trabalho acadêmico, mas **não há nenhuma evidência no repositório que confirme essa hipótese** e ela não deve ser afirmada no documento sem validação do solicitante.

---

## 3. Objetivos — capacidades verificadas

Classificação de cada capacidade verificada:

- **[OK]** — implementada e coberta por teste
- **[PARCIAL]** — implementada, mas incompleta/limitada
- **[SIMULADO]** — implementada, porém sem efeito externo real
- **[DÉBITO]** — implementada com risco/dívida técnica conhecida

| # | Capacidade | Estado | Evidência |
|---|---|---|---|
| C1 | Cadastro, login e perfil de usuário com JWT | **[OK]** | `backend/src/services/authService.ts:41-124`; `backend/src/routes/authRoutes.ts:20-24` |
| C2 | Autorização por papel (`client`/`factory`/`staff`) em nível de rota | **[OK]** | `backend/src/middlewares/auth.ts:34-40`; `backend/src/routes/stockRoutes.ts:21-26` |
| C3 | Autorização de objeto (BOLA/IDOR) em atualização de status de pedido | **[OK]** | `backend/src/services/orderService.ts:65-77`; teste `backend/tests/integration/orders-status-bola.test.ts:22-169` (8 casos) |
| C4 | CRUD de categorias com bloqueio de exclusão em uso | **[OK]** | `backend/src/controllers/categoryController.ts:14-150` |
| C5 | CRUD de produtos com listagem paginada, filtro por categoria e busca textual | **[OK]** | `backend/src/controllers/productController.ts:15-189` |
| C6 | Remoção lógica de produto preservando histórico de pedidos | **[OK]** | `backend/src/controllers/productController.ts:196-220` |
| C7 | Gestão de estoque com 3 operações (`set`/`add`/`subtract`) e bloqueio de estoque negativo | **[OK]** | `backend/src/controllers/stockController.ts:94-169` |
| C8 | Alertas de estoque abaixo do mínimo, com déficit calculado | **[OK]** | `backend/src/controllers/stockController.ts:175-194` |
| C9 | Personalização de armação em 3D (Three.js) com 14 parâmetros configuráveis | **[PARCIAL]** | `frontend/src/components/creator/CustomizationPanel.tsx:76-376`; cena em `frontend/src/components/creator/ThreePreview.tsx:41-610` |
| C10 | Provador virtual (AR) por detecção facial com MediaPipe FaceLandmarker | **[PARCIAL]** | `frontend/src/components/creator/TryOnViewport.tsx:36-178` — overlay é **2D (Canvas 2D)**, não 3D: `:87-128`; "AI suggestions" são regras `if/else`, não modelo: `:72-85` |
| C11 | Persistência de designs salvos do usuário | **[PARCIAL]** | Backend persiste 12 campos (`backend/src/controllers/designController.ts:58-70`); frontend envia 12 de ~20 parâmetros — materiais de armação/lente/componentes ficam só no cliente (`frontend/src/components/creator/CreatorModals.tsx:69-82` vs `frontend/src/contexts/CreatorStudioContext.tsx:25-39`) |
| C12 | Checkout de carrinho multi-item transacional | **[OK]** | `backend/src/controllers/orderController.ts:208-267` (BEGIN/COMMIT/ROLLBACK + `client.release()`) |
| C13 | Cobrança via AbacatePay (Pix) | **[SIMULADO]** | Real: `backend/src/controllers/paymentController.ts:75-107`. Simulador automático quando `ABACATE_TOKEN` ausente ou placeholder: `:57,62-73`. Fallback silencioso para simulador em qualquer falha: `:109-128` |
| C14 | Confirmação de pagamento por webhook assinado (HMAC-SHA256) | **[PARCIAL]** | `backend/src/controllers/paymentController.ts:206-217` — valida assinatura **apenas** se `ABACATE_TOKEN` for real (`:208`); em modo simulador o webhook aceita qualquer payload |
| C15 | Ciclo de vida do pedido com notificação por e-mail | **[PARCIAL]** | `backend/src/services/orderService.ts:20-26`; e-mail só para 2 de 5 status (`backend/src/utils/emailService.ts:58,73`); envio *fire-and-forget* sem `await` (`backend/src/controllers/orderController.ts:174`) |
| C16 | Dashboards de fábrica e de staff com métricas sobre dados reais | **[OK]** | `frontend/src/components/Dashboards.tsx:122-351` (fábrica), `:353-688` (staff); origem dos dados em `frontend/src/contexts/OrderContext.tsx:19-30` |
| C17 | Contrato de erro padronizado (Problem Details RFC 9457) | **[OK]** | `backend/src/errors/problem.ts:1-151`; `backend/src/middlewares/problemErrorHandler.ts:225-243`; 20 testes (`backend/tests/integration/problem-details.test.ts:141-305`) |
| C18 | Correlação de requisição por `X-Request-Id` / `traceId` | **[OK]** | `backend/src/middlewares/requestId.ts:11-17`; testes `backend/tests/integration/traceid.test.ts:119-248` |
| C19 | Catálogo de produtos alimentado pelo backend | **[DÉBITO]** | Backend expõe 5 rotas (`backend/src/routes/productRoutes.ts:19-25`) e o frontend **não consome nenhuma**; `Marketplace.tsx:26-59` usa array literal `baseProducts`; `getAllProducts()` retorna só esses 4 (`:77-80`) |
| C20 | Módulos de categorias, estoque e listagem de pagamentos | **[DÉBITO]** | Rotas existem e são testadas indiretamente, mas **nenhuma chamada no frontend** (verificação por grep em `frontend/src`) |
| C21 | Vitrine pública de designs de terceiros (`published = true`) | **[DÉBITO]** | `published` é sempre gravado como `false` (`frontend/src/components/creator/CreatorModals.tsx:63`); não há UI de publicação; o Marketplace não lê `designs`; o ramo `type === "saved"` é código morto (`frontend/src/components/Marketplace.tsx:148-150`) |
| C22 | Otimização de preço no servidor | **[DÉBITO]** | `total` é **aceito do corpo da requisição** sem recálculo no servidor (`backend/src/controllers/orderController.ts:19,47`; `backend/src/controllers/orderController.ts:224,247`) — debitado como **SEC-05** em `backend/tests/helpers/orders.ts:6-7` |
| C23 | Login social (Google) | **[DÉBITO]** | Stub: `alert("Google Login would open here.")` — `frontend/src/components/AuthPage.tsx:189` |
| C24 | Candidatura a parceiro/fábrica | **[DÉBITO]** | Stub: `alert("Redirecting to Partner Application...")` — `frontend/src/components/AuthPage.tsx:278` |

---

## 4. Escopo e Delimitação

### 4.1 Dentro do escopo (módulos existentes no backend)

Todos os módulos abaixo estão implementados, montados em `backend/src/app.ts` e, portanto, dentro do escopo funcional do sistema.

| Módulo | Base de rota | Controller | Service | Montagem |
|---|---|---|---|---|
| **Autenticação e usuários** | `/api/auth` | `backend/src/controllers/authController.ts` | `backend/src/services/authService.ts` (Prisma + DTOs) | `backend/src/app.ts:103` |
| **Categorias** | `/api/categories` | `backend/src/controllers/categoryController.ts` | — (SQL direto) | `backend/src/app.ts:108` |
| **Produtos** | `/api/products` | `backend/src/controllers/productController.ts` | — (SQL direto) | `backend/src/app.ts:107` |
| **Estoque** | `/api/stock` | `backend/src/controllers/stockController.ts` | — (SQL direto) | `backend/src/app.ts:109` |
| **Designs (personalizações)** | `/api/designs` | `backend/src/controllers/designController.ts` | — (SQL direto) | `backend/src/app.ts:106` |
| **Pedidos** | `/api/orders` | `backend/src/controllers/orderController.ts` | `backend/src/services/orderService.ts` (Prisma) | `backend/src/app.ts:104` |
| **Pagamentos** | `/api/payments` | `backend/src/controllers/paymentController.ts` | — (SQL direto) | `backend/src/app.ts:105` |
| **Saúde da aplicação** | `/health` | inline em `backend/src/app.ts:111-113` | — | `backend/src/app.ts:111` |

**Módulos transversais:**

| Módulo | Arquivo |
|---|---|
| Configuração e validação de ambiente | `backend/src/config/env.ts` |
| Pool de conexões PostgreSQL (`pg`) | `backend/src/config/db.ts` |
| Cliente Prisma (singleton) | `backend/src/config/prisma.ts` |
| Autenticação/autorização | `backend/src/middlewares/auth.ts` |
| Identificador de correlação | `backend/src/middlewares/requestId.ts` |
| Tradução centralizada de erros | `backend/src/middlewares/problemErrorHandler.ts` |
| Hierarquia de erros de domínio | `backend/src/errors/problem.ts` |
| Log estruturado | `backend/src/utils/logger.ts` |
| Notificação por e-mail | `backend/src/utils/emailService.ts` |
| DTOs de auth | `backend/src/dtos/auth/` (6 arquivos) |
| **Camada de repositórios** | `backend/src/repositories/index.ts:1-2` — **VAZIA** (placeholder, `export {}`) |
| Seed de produção | `backend/prisma/seed.ts` |
| Seed de desenvolvimento | `backend/prisma/seed.dev.ts` |
| Esquema do banco | `backend/prisma/schema.prisma` + `backend/prisma/migrations/20260901133803_init/migration.sql` |
| Legado preservado | `legacy/src/config/schema.sql`, `legacy/src/scripts/migrate.ts` |

### 4.2 Fora do escopo — ausência comprovada no repositório

| # | Item | Evidência de ausência |
|---|---|---|
| F1 | **Pagamento real** — o gateway só opera em modo real se `ABACATE_TOKEN` estiver definido fora do placeholder; o padrão documentado (`.env.example:25` `ABACATE_TOKEN=`) é simulador. | `backend/src/controllers/paymentController.ts:57,62-73` |
| F2 | **Entrega / logística / rastreamento** — nenhum modelo, rota, controller ou serviço de envio. O status `Delivered` é apenas um rótulo. | `backend/prisma/schema.prisma:65-71` (único terminal) |
| F3 | **Painel administrativo (back-office) próprio** — existe `StaffDashboard` no frontend, mas é um painel de *leitura* de pedidos e usuários; não há UI de CRUD de produtos, categorias ou estoque. | `frontend/src/components/Dashboards.tsx:641-681` (tabela somente leitura); endpoints nunca chamados no frontend |
| F4 | **Gestão de fábricas** — não há CRUD de `Usuario(role=factory)`; a fábrica é atribuída por `LIMIT 1` ou por código do frontend. | `backend/src/controllers/orderController.ts:31-33`; `frontend/src/components/DesignsGallery.tsx:52-53` (`"factory-demo"`) |
| F5 | **Faturamento / repasse ao fabricante** — nenhum modelo de split de pagamento, comissão ousettlement. | Ausência no schema (`backend/prisma/schema.prisma`) |
| F6 | **Cálculo de preço no servidor** — a tabela de preços é 100% client-side; o servidor confia no `total` enviado. | `frontend/src/utils/pricing.ts:1-26`; `backend/src/controllers/orderController.ts:19` |
| F7 | **Catálogo de designs parametrizados (modelos 3D como dado)** — as dimensões dos 3 modelos (`aviator`/`wayfarer`/`cateye`) são literais no frontend. | `frontend/src/components/creator/ThreePreview.tsx:41-45` |
| F8 | **E-mail transacional real** — em produção o serviço usa Ethereal, um serviço de e-mail descartável; não há SMTP configurável. | `backend/src/utils/emailService.ts:29-39` (host fixo `smtp.ethereal.email`) |
| F9 | **Recuperação de senha / verificação de e-mail / MFA** — não há rota nem fluxo. | `backend/src/routes/authRoutes.ts:20-27` (6 rotas, nenhuma delas) |
| F10 | **Refresh token / revogação de sessão** — JWT de 7 dias, sem blacklist e sem refresh. | `backend/src/services/authService.ts:38` (`expiresIn: "7d"`) |
| F11 | **Internacionalização no backend** — mensagens de erro fixas em pt-BR, exceto o e-mail (en-US). | `backend/src/errors/problem.ts:69,79,88,...` vs `backend/src/utils/emailService.ts:60` |
| F12 | **Infraestrutura como código** — sem Dockerfile, docker-compose, IaC ou deploy do backend. Só o frontend tem config de Vercel. | `frontend/vercel.json`; nenhum Dockerfile no repositório |
| F13 | **Documentação de API executável (OpenAPI/Swagger)** — `docs/api/README.md` define apenas convenções de erro, sem catálogo de endpoints. | `docs/api/README.md:1-23` |
| F14 | **Métricas de negócio persistidas** — faturamento, ticket médio e SLA são calculados no navegador a cada render. | `frontend/src/components/Dashboards.tsx:151-153`, `:42-54` |

### 4.3 Delimitação por papel (autorização como fronteira de escopo)

| Papel | O que o papel pode fazer (backend) | Fonte |
|---|---|---|
| **Anônimo** | Registrar-se, login; ver produtos e categorias; ver health; usar checkout simulado; enviar webhook | `backend/src/routes/authRoutes.ts:20-21`, `productRoutes.ts:19-20`, `categoryRoutes.ts:19-20`, `app.ts:111`, `paymentRoutes.ts:19-23` |
| **client** | Tudo de anônimo + perfil próprio; CRUD dos próprios designs; criar pedido; checkout do carrinho; listar **apenas os próprios** pedidos | `backend/src/routes/designRoutes.ts:8-12`, `orderRoutes.ts:9-11`, `backend/src/controllers/orderController.ts:108-115` |
| **factory** | Listar **apenas os próprios** pedidos; consultar estoque; **alterar status apenas de pedidos seus** | `backend/src/controllers/orderController.ts:116-123`; `stockRoutes.ts:21-23`; `backend/src/services/orderService.ts:63-77` |
| **staff** | CRUD de produtos, categorias e estoque; listar todos os pedidos; listar todos os usuários; CRUD de usuários; listar todos os pagamentos; alterar status de **qualquer** pedido | `productRoutes.ts:23-25`, `categoryRoutes.ts:23-25`, `stockRoutes.ts:26`, `orderController.ts:124-131`, `authRoutes.ts:25-27`, `paymentRoutes.ts:29`, `orderService.ts:63,68` |

**Distinção semântica crítica de autorização** (documentada e testada): **403 = falta de papel; 404 = falta de posse.** As duas condições produzem respostas idênticas quando ambas decorrem de "não existe ou não é seu", para não criar oráculo de enumeração.
- Evidência do desenho: `backend/src/services/orderService.ts:53-56` e `:79-82`
- Evidência do teste: `backend/tests/integration/orders-status-bola.test.ts:59-86` (pedido alheio ≡ pedido inexistente) e `:101-116` (papel errado → 403, não 404)

**Nota de alinhamento com a política do repositório:** `docs/security/README.md:5` exige que toda operação com identificador de objeto autorize no servidor. Hoje isso é Cumprido **apenas** para `PUT /api/orders/:publicId/status` e `POST /api/payments/create-billing`. Não é cumprido para `GET /api/designs/:id` (rota nem existe), `GET /api/stock/product/:produtoId` (escopo de staff/factory, aceitável), nem para a listagem de `pagamentos` (staff-only). Ver Seção 8, lacuna L10.

---

## 5. Engenharia de Requisitos — método e convenções

### 5.1 Método aplicado no levantamento

1. **Extração exaustiva de rotas**: leitura de `backend/src/app.ts` (montagem) + dos 7 arquivos em `backend/src/routes/` + dos 7 controllers. Nenhum endpoint foi inferido — todos foram lidos no código.
2. **Classificação do ator por rota**: derivada da cadeia de middlewares (`protect`, `authorize(...)`) e, quando a autorização é feita dentro do handler/service, do próprio corpo do código.
3. **Separação entre capacidade e simulação**: cada RF foi confrontado com o comportamento efetivo (ex.: gateway de pagamento, envio de e-mail, catálogo do frontend).
4. **Classificação de maturidade**: **[OK] / [PARCIAL] / [SIMULADO] / [DÉBITO]**, para separar o que está entregue do que é stub ouKnown debt.
5. **Rastreabilidade**: todo RF e RNF aponta para `arquivo:linha`. A matriz completa está no Apêndice A.

### 5.2 Convenções de resposta de erro (contrato normativo já decidido)

Respostas de erro seguem `application/problem+json` (RFC 9457), conforme `docs/api/README.md:3` e implementado em `backend/src/middlewares/problemErrorHandler.ts:197-219`:

| Campo | Obrigatório | Origem | Evidência |
|---|---|---|---|
| `type` | sim | URI estável `${PROBLEM_TYPE_NAMESPACE}/{slug}` | `backend/src/errors/problem.ts:2-7` |
| `title` | sim | Título fixo por subclasse | `backend/src/errors/problem.ts:28-33` |
| `status` | sim | Código HTTP coerente com o transporte | `backend/src/errors/problem.ts:31`, `problemErrorHandler.ts:216` |
| `detail` | quando seguro | Mensagem contextual, nunca stack/SQL/driver | `backend/src/middlewares/problemErrorHandler.ts:199`, `traceid.test.ts:128-138` |
| `instance` | sim (= `traceId`) | UUID de correlação | `problemErrorHandler.ts:203`, `requestId.ts:13` |
| `traceId` | sim | UUID, igual a `instance` e ao header `X-Request-Id` | `problemErrorHandler.ts:205`, `requestId.ts:14` |
| `timestamp` | sim | ISO-8601 | `problemErrorHandler.ts:204` |
| `error` | sim | Alias de compatibilidade com o frontend legado (`= detail`) | `problemErrorHandler.ts:206`, testado em `problem-details.test.ts:56-57` |
| `errors[]` | condicional | Extensão de `ValidationProblem` (422) | `backend/src/errors/problem.ts:137-150` |

**Tipos de problema catalogados** (`backend/src/errors/problem.ts`): `bad-request` (400), `unauthorized` (401), `forbidden` (403), `not-found` (404), `conflict` (409), `rate-limit` (429), `internal-error` (500), `validation` (422).

### 5.3 Convenção de sucesso

Respostas bem-sucedidas usam `{ success: true, ...payload }` — envelope não normativo, adotado por convenção em todos os controllers (ex.: `backend/src/controllers/authController.ts:6`, `productController.ts:56`, `orderController.ts:141`).

> **Lacuna relevante:** o frontend **não consome** `detail`/`traceId`/`type` — apenas `success` e `error` (verificação: `frontend/src/contexts/AuthContext.tsx:20,34,52`; `frontend/src/contexts/OrderContext.tsx:23,52`; `frontend/src/contexts/CartContext.tsx:60`). O contrato de error handling está implementado e testado no servidor, mas **não é aproveitado pelo cliente**. Ver lacuna L11.

### 5.4 Convenção de paginação

Duas variantes coexistem no backend, sem padronização:

| Variante | Onde | Formato |
|---|---|---|
| plana | `backend/src/controllers/productController.ts:115-121` | `{ total, page, totalPages }` no topo |
| aninhada | `backend/src/services/authService.ts:138-146`, `backend/src/controllers/orderController.ts:141-150`, `paymentController.ts:185-194`, `stockController.ts:46-57` | `pagination: { page, limit, totalItems, totalPages }` |

> Ver lacuna L12.

---

## 6. Requisitos Funcionais (RF01–RF33)

**Total: 33 endpoints.** Todos os endpoints foram lidos no código-fonte; nenhum foi inferido.

### Legenda de atores

| Sigla | Significado |
|---|---|
| `ANON` | Anônimo (sem token) |
| `CLIENT` | Autenticado com `role = client` |
| `FACTORY` | Autenticado com `role = factory` |
| `STAFF` | Autenticado com `role = staff` |
| `EXT` | Chamada externa de terceiro (gateway de pagamento) |

---

### 6.1 Módulo: Saúde da aplicação (1 RF)

| ID | Método · Path | Ator | Descrição do requisito (formato "o sistema deve permitir que…") | Evidência |
|---|---|---|---|---|
| **RF01** | `GET /health` | `ANON` | O sistema deve permitir que qualquer cliente consulte o estado de saúde do serviço, recebendo confirmação de que a aplicação está ativa e responsiva. | Rota: `backend/src/app.ts:111-113`. Testado: `backend/tests/smoke/health.test.ts:16-21` |

---

### 6.2 Módulo: Autenticação e usuários (6 RFs)

| ID | Método · Path | Ator | Descrição do requisito | Evidência |
|---|---|---|---|---|
| **RF02** | `POST /api/auth/register` | `ANON` | O sistema deve permitir que um visitante crie uma conta de cliente, informando nome, e-mail e senha; deve validar o formato do e-mail, exigir senha com no mínimo 8 caracteres contendo letras e números, normalizar o e-mail para minúsculas, recusar e-mails já cadastrados, armazenar **apenas o hash** da senha e devolver um token de acesso. O papel do novo usuário é sempre `client` (não é solicitado nem aceito no corpo). | Rota: `backend/src/routes/authRoutes.ts:20` · Controller: `backend/src/controllers/authController.ts:4-7` · Service: `backend/src/services/authService.ts:41-84` (validações `:44-59`, duplicidade `:61-67`, hash `:69`, papel fixo `:76`) |
| **RF03** | `POST /api/auth/login` | `ANON` | O sistema deve permitir que um usuário autenticado com e-mail e senha válidos; deve comparar a senha com o hash armazenado, devolver **mensagem genérica idêntica** para e-mail inexistente e senha incorreta (impedindo enumeração de contas) e emitir token de acesso válido por 7 dias. | Rota: `backend/src/routes/authRoutes.ts:21` · Controller: `authController.ts:9-12` · Service: `backend/src/services/authService.ts:86-112` (mensagem única `:100,105`; expiração `:38`) |
| **RF04** | `GET /api/auth/me` | Autenticado (qualquer papel) | O sistema deve permitir que um usuário autenticado consulte o próprio perfil (nome, e-mail, papel, nome da fábrica, data de criação), usando **exclusivamente** a identidade do token validado — nunca um identificador enviado no corpo ou na URL. | Rota: `backend/src/routes/authRoutes.ts:24` (`protect`) · Controller: `authController.ts:14-17` · Service: `authService.ts:114-124` |
| **RF05** | `GET /api/auth/users?page=&limit=` | `STAFF` | O sistema deve permitir que um administrador liste as contas de usuários de forma paginada, ordenadas da mais recente para a mais antiga, com total de itens e total de páginas; o sistema **não deve expor** o hash de senha. | Rota: `backend/src/routes/authRoutes.ts:25` (`authorize("staff")`) · Controller: `authController.ts:19-24` · Service: `authService.ts:126-147` + mapper sem `senhaHash` `:18-34` |
| **RF06** | `PUT /api/auth/users/:id` | `STAFF` | O sistema deve permitir que um administrador atualize o nome e o nome da fábrica de um usuário existente; deve recusar a atualização se o nome for ausente ou se o usuário não existir. | Rota: `backend/src/routes/authRoutes.ts:26` · Controller: `authController.ts:26-29` · Service: `authService.ts:149-171` |
| **RF07** | `DELETE /api/auth/users/:id` | `STAFF` | O sistema deve permitir que um administrador remova uma conta de usuário; deve recusar a remoção se o usuário não existir. Em razão das relações em cascata, a remoção também apaga pedidos e designs do usuário. | Rota: `backend/src/routes/authRoutes.ts:27` · Controller: `authController.ts:31-34` · Service: `authService.ts:173-185` · Cascatas: `backend/prisma/schema.prisma:91,180` |

> **Observação de escopo:** `UpdateUserDTO` declara `email`, `password` e `role` (`backend/src/dtos/auth/update-user.dto.ts:3-9`), mas o service **ignora esses três campos** (`authService.ts:150,164-170`). A troca de papel e a troca de senha **não são possíveis pela API** — e-mail/papel só podem mudar por `seed.ts` (staff) ou por promoção direta no banco. Ver lacuna L13.

---

### 6.3 Módulo: Categorias (5 RFs)

| ID | Método · Path | Ator | Descrição do requisito | Evidência |
|---|---|---|---|---|
| **RF08** | `GET /api/categories` | `ANON` | O sistema deve permitir que qualquer visitante consulte a lista de categorias do catálogo, ordenadas alfabeticamente, cada uma acompanhada da **quantidade de produtos ativos** vinculados; categorias sem produtos devem aparecer com contagem zero. | Rota: `backend/src/routes/categoryRoutes.ts:19` · Controller: `categoryController.ts:48-64` (`LEFT JOIN` + `COUNT`, `:56-60`) |
| **RF09** | `GET /api/categories/:id` | `ANON` | O sistema deve permitir que qualquer visitante consulte uma categoria específica, recebendo seus dados e a relação dos **produtos ativos** que a utilizam; deve responder "não encontrado" se a categoria não existir. | Rota: `categoryRoutes.ts:20` · Controller: `categoryController.ts:70-93` (`:79-81`, `:84-87`, composição `:89-92`) |
| **RF10** | `POST /api/categories` | `STAFF` | O sistema deve permitir que um administrador crie uma categoria, informando nome e descrição; deve exigir o nome, removendo espaços nas extremidades, e **recusar** a criação quando já existir categoria com o mesmo nome. | Rota: `categoryRoutes.ts:23` · Controller: `categoryController.ts:14-42` (obrigatoriedade `:17-19`, duplicidade `:22-29`) |
| **RF11** | `PUT /api/categories/:id` | `STAFF` | O sistema deve permitir que um administrador altere o nome e a descrição de uma categoria existente; deve exigir o nome e responder "não encontrado" se a categoria não existir. | Rota: `categoryRoutes.ts:24` · Controller: `categoryController.ts:99-119` |
| **RF12** | `DELETE /api/categories/:id` | `STAFF` | O sistema deve permitir que um administrador exclua uma categoria **desde que nenhum produto ativo a utilize**; caso contrário deve recusar a exclusão informando quantos produtos ainda a referenciam. | Rota: `categoryRoutes.ts:25` · Controller: `categoryController.ts:125-150` (regra de bloqueio `:129-138`) |

---

### 6.4 Módulo: Produtos (5 RFs)

| ID | Método · Path | Ator | Descrição do requisito | Evidência |
|---|---|---|---|---|
| **RF13** | `GET /api/products?categoria_id=&search=&page=&limit=` | `ANON` | O sistema deve permitir que qualquer visitante consulte o catálogo de produtos **ativos**, com paginação (padrão 20, teto 100), ordenados do mais recente para o mais antigo; deve permitir filtrar por categoria e buscar por texto no nome ou na descrição, de forma insensível a maiúsculas; a resposta deve informar o total de itens e o total de páginas, e cada produto deve vir acompanhado do nome da categoria e da quantidade em estoque. | Rota: `backend/src/routes/productRoutes.ts:19` · Controller: `productController.ts:63-122` (normalização de `limit`/`offset` `:66-67`, filtros `:73-82`, paginação + contagem `:88-121`, joins `:100-102`) |
| **RF14** | `GET /api/products/:id` | `ANON` | O sistema deve permitir que qualquer visitante consulte um produto pelo identificador, recebendo seus dados, o nome da categoria, a quantidade e o estoque mínimo; deve responder "não encontrado" se o produto não existir. | Rota: `productRoutes.ts:20` · Controller: `productController.ts:128-149` |
| **RF15** | `POST /api/products` | `STAFF` | O sistema deve permitir que um administrador cadastre um produto, informando nome, descrição, preço, categoria e imagem; deve exigir nome e preço, **recusar preço não numérico ou não positivo**, criar automaticamente o registro de estoque inicial com quantidade 0 e mínimo 5, e devolver o produto cadastrado. | Rota: `productRoutes.ts:23` · Controller: `productController.ts:15-57` (validações `:18-24`, criação de estoque `:42-45`, retorno `:48-56`) |
| **RF16** | `PUT /api/products/:id` | `STAFF` | O sistema deve permitir que um administrador atualize nome, descrição, preço, categoria, imagem e situation de atividade de um produto; deve exigir nome e preço, e responder "não encontrado" se o produto não existir. | Rota: `productRoutes.ts:24` · Controller: `productController.ts:155-189` (validações `:159-161`, `:178-180`) |
| **RF17** | `DELETE /api/products/:id` | `STAFF` | O sistema deve permitir que um administrador **desative** um produto, preservando o histórico de pedidos que o referenciam; deve verificar a existência do produto e responder "não encontrado" caso contrário. | Rota: `productRoutes.ts:25` · Controller: `productController.ts:196-220` (verificação `:200-207`, soft delete `:209-214`, justificativa em comentário `:192-194`) |

---

### 6.5 Módulo: Estoque (4 RFs)

| ID | Método · Path | Ator | Descrição do requisito | Evidência |
|---|---|---|---|---|
| **RF18** | `GET /api/stock?page=&limit=` | `FACTORY`, `STAFF` | O sistema deve permitir que um administrador ou uma fábrica consulte a posição de estoque de todos os produtos **ativos**, de forma paginada e ordenada da menor para a maior quantidade; cada item deve indicar se está em nível crítico (quantidade ≤ estoque mínimo), e a resposta deve trazer a contagem de alertas da página e os nomes dos produtos críticos. | Rota: `backend/src/routes/stockRoutes.ts:21` (`authorize("staff","factory")`) · Controller: `stockController.ts:14-58` (flag `:33`, alertas `:44`, paginação `:51-56`) |
| **RF19** | `GET /api/stock/product/:produtoId` | `FACTORY`, `STAFF` | O sistema deve permitir que um administrador ou uma fábrica consulte a posição de estoque de um produto específico, recebendo nome, preço, quantidade, estoque mínimo e a indicação de alerta; deve responder "não encontrado" se o produto não tiver registro de estoque. | Rota: `stockRoutes.ts:23` · Controller: `stockController.ts:64-86` |
| **RF20** | `PUT /api/stock/product/:produtoId` | `STAFF` | O sistema deve permitir que um administrador altere a quantidade em estoque de um produto, optando por **definir** um valor absoluto, **somar** um incremento ou **subtrair** um decremento; deve exigir a quantidade e o tipo de operação válido (`set`, `add` ou `subtract`), **impedir que o estoque fique negativo** informando o disponível, permitir alteração opcional do estoque mínimo, e devolver a posição resultante com aviso de estoque baixo quando aplicável. | Rota: `stockRoutes.ts:26` (`authorize("staff")`) · Controller: `stockController.ts:94-169` (validações `:98-104`, operações `:119-133`, bloqueio de negativo `:128-131`, mínimo opcional `:139-142`, retorno com alerta `:161-168`) |
| **RF21** | `GET /api/stock/alerts` | `FACTORY`, `STAFF` | O sistema deve permitir que um administrador ou uma fábrica consulte exclusivamente os produtos em **nível de estoque baixo ou crítico**, ordenados pelo maior déficit, cada um com o déficit calculado (estoque mínimo − quantidade atual) e o total de itens afetados. | Rota: `stockRoutes.ts:22` · Controller: `stockController.ts:175-194` (filtro `:185`, déficit `:182`, ordenação `:186`) |

---

### 6.6 Módulo: Designs — personalizações de armação (3 RFs)

> **Definição de domínio (essencial para o documento):** um *design* é a **configuração de uma armação de óculos personalizada sob encomenda** — não um produto de catálogo, não uma peça autoral. É um registro de parâmetros técnicos (modelo/silhueta, cor, se é óculos de sol, tratamento antirreflexo, estilo de haste, barra superior, estilo de ponte, perfil da armação e abertura da haste) que o cliente monta no *Creator Studio* e que serve de **especificação de produção** enviada à fábrica. Evidência convergente: campos em `backend/prisma/schema.prisma:160-176`; seriado como `custom_specs` (JSON) no pedido em `backend/prisma/schema.prisma:83`; e-mail falando em "custom 3D frame design" com "specifications" em `backend/src/utils/emailService.ts:63-64`.

| ID | Método · Path | Ator | Descrição do requisito | Evidência |
|---|---|---|---|---|
| **RF22** | `POST /api/designs` | Autenticado (qualquer papel) | O sistema deve permitir que um cliente salve um design de armação, informando nome, modelo e cor, com as especificações opcionais (solar, antirreflexo, estilo de haste, barra superior, estilo de ponte, perfil, abertura da haste) e a indicação de publicação. Deve exigir nome, modelo e cor; deve **criar novo** registro quando não informado identificador; deve **atualizar** o registro existente quando o identificador informado pertencer ao próprio cliente; e deve **recusar** a atualização de design de outro cliente (ignorando silenciosamente a alteração). Deve atribuir a autoria exclusivamente ao usuário do token, sem aceitar o e-mail do corpo da requisição. | Rota: `backend/src/routes/designRoutes.ts:10` · Controller: `backend/src/controllers/designController.ts:14-77` (identidade do token `:21-22`, obrigatoriedade `:24-26`, geração de id `:29`, update escopado ao dono `:32-35`, insert `:58-70`, defaults `:66-68`) |
| **RF23** | `GET /api/designs` | Autenticado (qualquer papel) | O sistema deve permitir que um cliente liste **exclusivamente os seus próprios** designs, do mais recente para o mais antigo, devolvendo cada um com nome, modelo, cor e todas as especificações técnicas convertidas para o formato da API (camelCase), incluindo a indicação de publicação. | Rota: `designRoutes.ts:11` · Controller: `designController.ts:83-109` (escopo por `customer_email` do token `:84,87-88`, mapeamento `:91-106`) |
| **RF24** | `DELETE /api/designs/:id` | Autenticado (qualquer papel) | O sistema deve permitir que um cliente exclua um de seus designs; deve recusar a exclusão de design inexistente ou pertencente a outro cliente, respondendo de forma idêntica nos dois casos para não permitir inferência sobre a existência do recurso. | Rota: `designRoutes.ts:12` · Controller: `designController.ts:115-129` (escopo `:120-121`, 404 unificado `:124-126`) |

> **Nota de Consistência (débito):** `SavedDesign` possui `usuarioId` e `customerEmail` (`backend/prisma/schema.prisma:162-163`), mas **todos os controllers filtram por `customer_email`** e nunca por `usuarioId` (`designController.ts:33,87,120`). O índice `idx_designs_usuario` (`schema.prisma:182`) é portanto **subutilizado**. Consequência: se o usuário trocar de e-mail, perde o acesso aos seus designs. Ver lacuna L14.

---

### 6.7 Módulo: Pedidos (4 RFs)

| ID | Método · Path | Ator | Descrição do requisito | Evidência |
|---|---|---|---|---|
| **RF25** | `POST /api/orders` | Autenticado (qualquer papel) | O sistema deve permitir que um cliente registre um pedido de armação personalizada, informando nome do produto, fábrica destinatária, valor total e especificações de customização; deve preencher nome e e-mail do cliente **a partir da identidade do token**, **ignorando qualquer dado de cliente enviado no corpo**; deve criar o pedido **sempre** com status "Pending Payment", **recusando qualquer tentativa de definir o status pelo corpo** (travas contra bypass de pagamento); deve registrar as especificações em formato serializado; e deve atribuir automaticamente uma fábrica válida quando a informada não for numérica. | Rota: `backend/src/routes/orderRoutes.ts:9` · Controller: `backend/src/controllers/orderController.ts:17-76` (trava de status `:18,49`, obrigatoriedade `:21-23`, identidade do token `:25-27`, fallback de fábrica `:29-33`, insert `:35-51`, desserialização `:73`) |
| **RF26** | `POST /api/orders/checkout-cart` | Autenticado (qualquer papel) | O sistema deve permitir que um cliente finalize a compra de um carrinho com múltiplos itens, informando para cada item o produto, a fábrica, o valor unitário, a quantidade e as especificações; deve: **(a)** validar que todos os itens têm os campos obrigatórios; **(b)** calcular o total de cada item multiplicando o valor pela quantidade; **(c)** registrar todos os pedidos sob **um único identificador de cobrança consolidado**; **(d)** criar todos os pedidos **atomicamente** — se qualquer item falhar, nenhum pedido é persistido; **(e)** criar cada pedido com status "Pending Payment"; e **(f)** retornar a URL de checkout, indicate se ela é real ou simulada e o identificador da cobrança. | Rota: `orderRoutes.ts:10` · Controller: `orderController.ts:196-340` (validação `:199-201,217-221`, cálculo `:223-224`, ID consolidado `:206,238-239,249`, **transação** `:211,261,262-266`, insert `:235-251`, chamada ao gateway `:276-328`, resposta simulada `:331-338`) |
| **RF27** | `GET /api/orders?page=&limit=` | Autenticado — escopo por papel | O sistema deve permitir que um usuário autenticado liste pedidos, sendo que a **visibilidade é determinada pelo papel**: um cliente vê apenas os pedidos em que é o comprador; uma fábrica vê apenas os pedidos que lhe foram enviados; um administrador vê **todos** os pedidos. A resposta deve ser paginada, ordenada do mais recente para o mais antigo, com as especificações desserializadas; papéis não reconhecidos devem receber negação de acesso. | Rota: `orderRoutes.ts:11` (`router.use(protect)` em `:7`) · Controller: `orderController.ts:82-151` (branch `client` `:108-115`, `factory` `:116-123`, `staff` `:124-131`, negação `:132-134`, paginação `:141-150`) |
| **RF28** | `PUT /api/orders/:publicId/status` | `FACTORY`, `STAFF` | O sistema deve permitir que uma fábrica ou um administrador altere o status de um pedido, informando o novo status entre os cinco válidos do domínio (Pending Payment, Queued, In production, Delivered, Cancelled). Deve **recusar** com 403 se o ator não for fábrica nem administrador; deve **recusar** com 400 se o status não for reconhecido; deve autorizar a posse **na própria operação de escrita** (condição composta de pedido + fábrica), de modo que uma fábrica só alcance pedidos seus e o administrador alcance qualquer um; deve tratar "pedido inexistente" e "pedido de outra fábrica" de forma **indistinguível** (404 idêntico, sem oráculo de enumeração); deve incrementar a versão do pedido a cada alteração; deve recusar o uso do identificador numérico interno na URL; e deve **notificar o cliente por e-mail** quando o status for "In production" ou "Delivered". | Rota: `backend/src/routes/orderRoutes.ts:12` · Controller: `orderController.ts:157-190` (identidade do token `:166-172`, disparo de e-mail `:174-183`) · Service: `backend/src/services/orderService.ts:46-108` (403 por papel `:53-56`, 400 por status inválido `:58-61`, **autorização na mutação** `:65-77`, 404 unificado `:79-82`, releitura escopada `:85-105`, incremento de versão `:75`) · Testes: `backend/tests/integration/orders-status-bola.test.ts:22-169` (8 casos) · E-mail: `backend/src/utils/emailService.ts:58,73,90-99` |

---

### 6.8 Módulo: Pagamentos (5 RFs)

| ID | Método · Path | Ator | Descrição do requisito | Evidência |
|---|---|---|---|---|
| **RF29** | `POST /api/payments/create-billing` | Autenticado (dono do pedido ou `STAFF`) | O sistema deve permitir que o dono de um pedido (ou um administrador) gere a cobrança de um pedido já registrado, informando o identificador do pedido; deve **recusar** pedidos inexistentes; deve **recusar com 403** quando o pedido pertencer a outro cliente; deve criar a cobrança no gateway de pagamento e **registrar o pagamento** no sistema (método, valor, referência externa, status pendente); deve manter o pedido em "Pending Payment" vinculado ao identificador da cobrança; e deve retornar a URL de checkout indicando se é real ou simulada. | Rota: `backend/src/routes/paymentRoutes.ts:26` (`protect`) · Controller: `backend/src/controllers/paymentController.ts:36-129` (validação `:39-41`, 404 `:46-48`, **ownership** `:52-55`, detecção de mock `:57`, ramo simulado `:62-73`, ramo real `:75-107`, registro do pagamento `:105` e helper `:134-153`, fallback `:109-128`) |
| **RF30** | `GET /api/payments/simulated-checkout` | `ANON` | O sistema deve fornecer uma página de checkout Pix **simulada**, acessível publicamente por identificador de cobrança, exibindo valor total, itens do pedido, identificador da cobrança e dados do cliente, com botão para simular o pagamento; deve **escapar todo conteúdo interpolado** no HTML para evitar injeção de script; deve responder 400 sem identificador e 404 se nenhum pedido corresponder à cobrança. | Rota: `paymentRoutes.ts:22` (sem `protect`) · Controller: `paymentController.ts:249-327` (validações `:252-264`, agregação de total `:266`, **`escapeHTML`** `:20-27` aplicado em `:305-310,313-314`, form de confirmação `:312-316`) |
| **RF31** | `POST /api/payments/confirm-simulated-payment` | `ANON` | O sistema deve permitir que o pagamento simulado seja confirmado, alterando todos os pedidos vinculados à cobrança de "Pending Payment" para "Queued" e os pagamentos correspondentes para "aprovado"; deve redirecionar o cliente de volta à aplicação, **restringindo o destino** a hosts autorizados (localhost, host do `FRONTEND_URL` e subdomínios `.vercel.app`) e **bloqueando redirecionamento aberto** para destinos não autorizados. | Rota: `paymentRoutes.ts:23` (sem `protect`) · Controller: `paymentController.ts:333-373` (atualizações `:341-349`, **allowlist anti open-redirect** `:354-361`, redirect `:367`) |
| **RF32** | `POST /api/payments/webhook` | `EXT` (gateway de pagamento) | O sistema deve permitir que o gateway de pagamento notifique a confirmação de um pagamento; deve **validar a assinatura HMAC-SHA256** do corpo da requisição contra o token configurado, recusando payloads com assinatura ausente ou inválida; ao receber o evento de pagamento confirmado, deve localizar os pedidos pela referência de cobrança, movê-los de "Pending Payment" para "Queued" (enfileirando para produção) e marcar os pagamentos como "aprovado"; deve responder 200 mesmo para eventos não tratados. | Rota: `paymentRoutes.ts:19` (sem `protect` — chamada externa) · Controller: `paymentController.ts:201-243` (validação de assinatura `:206-217`, tratamento do evento `:219-240`, note a condição `:208` que só valida assinatura com token real) |
| **RF33** | `GET /api/payments?page=&limit=` | `STAFF` | O sistema deve permitir que um administrador consulte todos os pagamentos registrados, de forma paginada e ordenados do mais recente para o mais antigo, cada um com método, status, valor, referência externa, data de criação e os dados do cliente do pedido associado. | Rota: `paymentRoutes.ts:29` (`protect` + `authorize("staff")`) · Controller: `paymentController.ts:159-195` (join `:167-183`, paginação `:185-194`) |

---

### 6.9 Resumo por módulo

| Módulo | RFs | Qtd. | Autenticados | Públicos |
|---|---|---|---|---|
| Saúde | RF01 | 1 | 0 | 1 |
| Auth e usuários | RF02–RF07 | 6 | 4 | 2 |
| Categorias | RF08–RF12 | 5 | 3 | 2 |
| Produtos | RF13–RF17 | 5 | 3 | 2 |
| Estoque | RF18–RF21 | 4 | 4 | 0 |
| Designs | RF22–RF24 | 3 | 3 | 0 |
| Pedidos | RF25–RF28 | 4 | 4 | 0 |
| Pagamentos | RF29–RF33 | 5 | 2 | 3 |
| **TOTAL** | — | **33** | **23** | **10** |

---

## 7. Requisitos Não Funcionais (RNF01–RNF63)

Cada RNF abaixo cita **evidência concreta no código**. RNFs sem lastro documental foram omitidos (ver Seção 8).

### 7.1 Segurança

| ID | Requisito | Evidência concreta |
|---|---|---|
| **RNF01** | O sistema deve autenticar usuários por token JWT assinado, transmitido via cabeçalho `Authorization: Bearer`, com validade de 7 dias. | Biblioteca `jsonwebtoken@^9.0.2` (`backend/package.json:33`); emissão em `backend/src/services/authService.ts:37-39`; verificação em `backend/src/middlewares/auth.ts:12-31`; teste de rejeição de anônimo em `backend/tests/smoke/health.test.ts:42-46` |
| **RNF02** | O sistema deve recusar a inicialização se o segredo JWT não estiver definido no ambiente (falha rápida, sem degradar para segredo padrão). | `backend/src/middlewares/auth.ts:6-10` (`process.exit(1)`); `backend/src/services/authService.ts:12-16` (`throw`); ambos em nível de módulo, portanto no boot |
| **RNF03** | O sistema deve armazenar senhas exclusivamente como hash **bcrypt** (algoritmo), nunca em texto claro, com fator de custo 10. A implementação usa a biblioteca **pura em JavaScript `bcryptjs`**, e não o pacote nativo `bcrypt` — logo não há dependência de binário nativo no build. | `backend/src/services/authService.ts:1` (`import bcrypt from "bcryptjs"`), `:69` (`bcrypt.hash(password, 10)`); comparação em `:103` (`bcrypt.compare`); campo `senhaHash` em `backend/prisma/schema.prisma:31`; o mapper de resposta **omite** o hash (`authService.ts:18-34`) |
| **RNF04** | O sistema deve impor requisitos mínimos de senha (mínimo 8 caracteres, contendo letras e números) no cadastro. | `backend/src/services/authService.ts:54-59` |
| **RNF05** | O sistema deve limitar tentativas de login a **15 requisições por janela de 15 minutos por IP**, respondendo 429 no formato Problem Details. | `backend/src/app.ts:62-75` (limite `:66`, handler `:67-73`); tipo `rate-limit`/429 em `backend/src/errors/problem.ts:117-125` |
| **RNF06** | O sistema deve limitar requisições à API a **100 por janela de 15 minutos por IP**, respondendo 429. | `backend/src/app.ts:77-90` (limite `:81`) |
| **RNF07** | O sistema deve restringir as origens CORS a uma lista explícita (localhost 5173/5174/3000 e `FRONTEND_URL`), habilitando credenciais, e recusar origens não listadas. | `backend/src/app.ts:31-50` (allowlist `:31-36`, callback de recusa `:46`) |
| **RNF08** | O sistema deve aplicar cabeçalhos de segurança HTTP via `helmet`. | `backend/src/app.ts:52-57`; `backend/package.json:32` |
| **RNF09** | O sistema deve limitar o tamanho do corpo de requisição a 1 MB. | `backend/src/app.ts:93-94` |
| **RNF10** | O sistema deve autorizar **no servidor**, com base no papel, o acesso às rotas de escrita e às listagens privilegiadas. | Middleware `authorize(...roles)` em `backend/src/middlewares/auth.ts:34-40`; uso em `authRoutes.ts:25-27`, `productRoutes.ts:23-25`, `categoryRoutes.ts:23-25`, `stockRoutes.ts:21-26`, `paymentRoutes.ts:29`; teste de 403 vs 200 por papel em `backend/tests/smoke/health.test.ts:57-70` |
| **RNF11** | O sistema deve autorizar a posse do objeto **na própria cláusula de escrita**, evitando janela entre leitura e verificação (TOCTOU), e deve responder de forma indistinguível para "não existe" e "não é seu". | `backend/src/services/orderService.ts:65-77` (comentário explícito `:37-41`, `:84-85`); `updateMany` escopado `:65-70`; 404 unificado `:79-82`; **teste que prova que a tentativa negada não alterou o banco**: `backend/tests/integration/orders-status-bola.test.ts:54-56`; **teste de não-oráculo**: `:59-86` |
| **RNF12** | O sistema deve usar identificadores públicos opacos (UUID) na exposição de recursos, mantendo o identificador sequencial interno fora das rotas. | `publicId @unique @default(uuid())` em `backend/prisma/schema.prisma:36,55,89,178`; uso na rota `backend/src/routes/orderRoutes.ts:12`; teste garantindo que o id numérico não funciona: `backend/tests/integration/orders-status-bola.test.ts:154-169` |
| **RNF13** | O sistema deve ignorar campos de estado de negócio enviados pelo cliente que permitiriam bypass de pagamento. | `backend/src/controllers/orderController.ts:18` (comentário "Security Fix") e `:49` (`"Pending Payment" // 🔒 Trava de Segurança`); status nunca lido do `req.body` |
| **RNF14** | O sistema deve derivar a identidade do cliente exclusivamente do token validado, ignorando nome e e-mail enviados no corpo da requisição. | `backend/src/controllers/orderController.ts:25-27`; `backend/src/controllers/designController.ts:21-22`; `backend/src/controllers/paymentController.ts:53`; comentário em `backend/src/services/orderService.ts:10` |
| **RNF15** | O sistema deve impedir enumeração de contas no login, usando mensagem idêntica para e-mail inexistente e senha errada. | `backend/src/services/authService.ts:100` e `:105` — mesma string `"Email ou senha incorretos."` |
| **RNF16** | O sistema deve validar a assinatura HMAC-SHA256 de webhooks de pagamento antes de processá-los. | `backend/src/controllers/paymentController.ts:206-216` (`crypto.createHmac("sha256", ...)`, comparação `:213`) |
| **RNF17** | O sistema deve escapar conteúdo interpolado em HTML gerado dinamicamente, evitando injeção de script. | Função `escapeHTML` em `backend/src/controllers/paymentController.ts:20-27`; aplicada em `:305,309,310,313,314` |
| **RNF18** | O sistema deve bloquear redirecionamento aberto na confirmação de pagamento simulado, validando o host de destino contra uma allowlist. | `backend/src/controllers/paymentController.ts:354-361` (allowlist + `*.vercel.app`; log de bloqueio `:360`) |
| **RNF19** | O sistema deve usar consultas parametrizadas em todas as interações com o banco, evitando concatenação de valores. | Padrão `$1…$n` em `backend/src/controllers/designController.ts:33,44,63`, `productController.ts:28,49,80,88`, `categoryController.ts:23,32,108`, `stockController.ts:144`, `orderController.ts:36,56,112,229,236`, `paymentController.ts:144`; comentário explícito em `productController.ts:79` ("`LIKE` com `?` protege contra SQL Injection") |
| **RNF20** | O sistema deve evitar interpolação de valores não-validados em SQL; `LIMIT`/`OFFSET` interpolados devem estar previamente normalizados como inteiros dentro de faixa. | `backend/src/controllers/productController.ts:66-67` (clamps `1..100` e `≥0`) e `:84-88` (justificativa da exceção) |
| **RNF21** | O sistema deve versionar **apenas** arquivos `.env.example`, nunca arquivos de ambiente reais. | `.gitignore:33-46` (regras e exceções `!.env.example`, `!**/.env.*.example`); verificado: `git ls-files` retorna apenas `backend/.env.example`, `backend/.env.test.example`, `frontend/.env.example` — o `backend/.env.test` presente em disco **não** é rastreado |
| **RNF22** | O sistema não deve criar senha ou conta administrativa padrão; o provisionamento de privileged account deve ocorrer por variáveis de ambiente explícitas. | `backend/prisma/seed.ts:52-75` (pula criação se ausentes `:56-62`); `backend/.env.example:14-19` (comentadas e vazias); política declarada em `docs/security/README.md:24`; checklist em `backend/prisma/PR_DESCRIPTION.md:93-98` |
| **RNF23** | O seed de produção deve ser idempotente (executar duas vezes não duplica dados nem viola unicidade). | `backend/prisma/seed.ts:41-45` e `:64-73` (`upsert`); validado em `backend/prisma/PR_DESCRIPTION.md:100-103` |
| **RNF24** | O sistema deve ter a guarda de que o frontend **não possui** autenticação local de contingência: se a API falhar, login e cadastro devem falhar de forma segura, sem usuário demo. | Política em `docs/security/README.md:24`; comportamento do frontend: `frontend/src/contexts/AuthContext.tsx:92,116` (marca backend desconectado); `frontend/src/contexts/CartContext.tsx:67-70` (recusa checkout sem conexão segura) |

### 7.2 Confiabilidade e disponibilidade

| ID | Requisito | Evidência concreta |
|---|---|---|
| **RNF25** | O sistema deve padronizar **todas** as respostas de erro em `application/problem+json` (RFC 9457), incluindo erros de rota inexistente, erros de framework, erros legados e erros não mapeados. | Middleware global `backend/src/middlewares/problemErrorHandler.ts:225-243`; 404 de rota `backend/src/app.ts:116-119`; `Content-Type` `problemErrorHandler.ts:217`; **18 testes** em `backend/tests/integration/problem-details.test.ts:141-305` (incluindo "rede de segurança" `:196-219`) |
| **RNF26** | O sistema deve **traduzir** erros da camada de dados para códigos HTTP corretos: violação de unicidade (Prisma `P2002` / SQLSTATE `23505`, `23P01`) → 409; violação de FK (`23503`) → 409; não encontrado (Prisma `P2025` / SQLSTATE `P0002`) → 404. | `backend/src/middlewares/problemErrorHandler.ts:68-116` (Prisma `:75-100`, pg `:103-113`); testes `problem-details.test.ts:170-194` e `traceid.test.ts:213-239` |
| **RNF27** | O sistema **não deve vazar** stack trace, SQL, mensagem do driver, token ou caminho de arquivo nas respostas de erro; erros internos devem ser substituídos por mensagem genérica fixa, ficando o detalhe apenas no log. | `backend/src/middlewares/problemErrorHandler.ts:235` (mensagem fixa); `detalheSeguro` para erros de parsing `:122-129`; **6 testes de não-vazamento** em `backend/tests/integration/traceid.test.ts:124-191` (incluindo tabela/column inexistente, SQLSTATE, e caminho de arquivo) |
| **RNF28** | O sistema deve tornar cada falha de requisição rastreável por um identificador de correlação único, propagado no header `X-Request-Id`, no campo `instance` e no campo `traceId` da resposta, e presente no log do servidor. | `backend/src/middlewares/requestId.ts:11-17` (UUID gerado no servidor, nunca reutilizado do cliente — comentário `:5-9`); `problemErrorHandler.ts:203,205,230`; testes `traceid.test.ts:163-176` (mesma ocorrência recuperada no log) e `problem-details.test.ts:233-239` |
| **RNF29** | O sistema deve garantir atomicidade na criação de múltiplos pedidos a partir de um carrinho: em falha, nenhum pedido deve ser persistido. | `backend/src/controllers/orderController.ts:211` (`BEGIN`), `:261` (`COMMIT`), `:263` (`ROLLBACK`), `:264,267` (`client.release()`), `:265` (rethrow). Teste indireto: `traceid.test.ts:213-239` (violação de FK no checkout retorna 409, provando que a transação trata o erro) |
| **RNF30** | O sistema deve tratar processos fatais de forma segura: `unhandledRejection` e `uncaughtException` devem ser registrados e, no caso de exceção não tratada, o processo deve encerrar. | `backend/src/server.ts:6-13` |
| **RNF31** | O sistema deve encerrar de forma graciosa em `SIGINT`/`SIGTERM`, fechando o listener HTTP e o pool de conexões antes de sair. | `backend/src/server.ts:20-36` (fecha servidor `:23`, `pool.end()` `:25`, logs `:26,28`) |

### 7.3 Performance

| ID | Requisito | Evidência concreta |
|---|---|---|
| **RNF32** | O sistema deve manter índices no banco para as colunas usadas em filtro e ordenação de listagens. | `backend/prisma/schema.prisma`: `idx_produtos_categoria` (`:61`), `idx_pedidos_usuario` (`:96`), `idx_pedidos_factory` (`:97`), `idx_pedidos_status` (`:98`), `idx_pedidos_billing` (`:99`), `idx_itens_pedido` (`:113`), `idx_itens_produto` (`:114`), `idx_pagamentos_pedido` (`:156`), `idx_designs_usuario` (`:182`), `idx_designs_email` (`:183`) + 6 índices UNIQUE. Correspondência 1:1 no SQL: `backend/prisma/migrations/20260901133803_init/migration.sql:133-182` |
| **RNF33** | O sistema deve aplicar paginação às listagens de coleções. | Produtos `backend/src/controllers/productController.ts:66-67,88,115-121`; pedidos `orderController.ts:101-103,112,120,128`; pagamentos `paymentController.ts:160-162,181,185-194`; estoque `stockController.ts:15-17,39,46-57`; usuários `backend/src/services/authService.ts:127,130-136` |
| **RNF34** | O sistema deve utilizar pool de conexões com limite e timeouts configurados, em vez de abrir conexões por requisição. | `backend/src/config/db.ts:15-28` (`max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 15000`); reutilização declarada no cabeçalho `:4` |
| **RNF35** | O sistema deve limitar a página de listagem a um teto, evitando consultas ilimitadas. | `backend/src/controllers/productController.ts:66` (clamp `Math.min(100, ...)`) — **apenas no módulo de produtos**; os demais módulos aplicam `parseInt` sem teto (`orderController.ts:102`, `paymentController.ts:161`, `stockController.ts:16`). Ver lacuna L15 |
| **RNF36** | O sistema deve evitar operações de escrita desnecessárias na criação de produtos (auto-insert de estoque seguido de releitura). | `backend/src/controllers/productController.ts:27-56` — 3 round-trips. Observação factual, não requisito: otimizável com `RETURNING` + join único. Ver lacuna L16 |

### 7.4 Observabilidade

| ID | Requisito | Evidência concreta |
|---|---|---|
| **RNF37** | O sistema deve emitir logs estruturados em JSON, com nível ajustável por ambiente (`debug` fora de produção, `info` em produção) e saída legível em desenvolvimento. | `backend/src/utils/logger.ts:4-15` (nível `:5`, `pino-pretty` `:6-14`) |
| **RNF38** | O sistema deve registrar o método e o caminho de cada requisição recebida. | `backend/src/app.ts:96-101` |
| **RNF39** | O sistema deve registrar a ocorrência de rotas não encontradas. | `backend/src/app.ts:116-119` |
| **RNF40** | O sistema deve registrar falhas internas com o identificador de correlação, o erro completo e a stack trace — contrastando com o corpo da resposta, que não os contém. | `backend/src/middlewares/problemErrorHandler.ts:234,239`; Controllers: `orderController.ts:324-327`, `paymentController.ts:110-113,148-151,324,370`; **Teste de contraste explícito**: `backend/tests/integration/traceid.test.ts:178-191` |
| **RNF41** | O sistema deve registrar falhas de notificação por e-mail sem derrubar a operação de negócio que as originou. | `backend/src/utils/emailService.ts:146-151` (`catch` + log); `:123-128` (transporte indisponível → ignora); o disparo é fire-and-forget (`backend/src/controllers/orderController.ts:174`) |
| **RNF42** | O sistema deve registrar falhas de integração com o gateway de pagamento e o degradado para o simulador. | `backend/src/controllers/paymentController.ts:110-113`; `backend/src/controllers/orderController.ts:324-327` |

> **Nota de consistência (débito):** `handleWebhook` e `confirmSimulatedPayment` usam `console.log`/`console.warn` em vez do logger estruturado — `backend/src/controllers/paymentController.ts:203,214,238,360,363`. Ver lacuna L17.

### 7.5 Manutenibilidade

| ID | Requisito | Evidência concreta |
|---|---|---|
| **RNF43** | Todo o código de produção deve ser escrito em TypeScript com verificação estrita de tipos habilitada. | `backend/tsconfig.json:8` (`"strict": true`), `forceConsistentCasingInFileNames: true` (`:10`), `noUncheckedSideEffectImports` (`:14`); `npm run typecheck` valida app e testes (`backend/package.json:11`) e roda no CI (`.github/workflows/ci.yml:79-80`). **Exceção:** o frontend tem `strict: false` (`frontend/tsconfig.json:10`) |
| **RNF44** | O sistema deve separar responsabilidades em camadas (rotas → controllers → services → acesso a dados) e manter as regras de negócio fora dos controllers HTTP. | `backend/src/services/orderService.ts:1-4` ("Não conhece Request nem Response"); `OrderService` recebe uma estrutura `Ator` (`:11-14`) e não recebe `req`/`res`; comparação com `AuthService`, igualmente isolado (`backend/src/services/authService.ts:36`) |
| **RNF45** | O sistema deve centralizar o tratamento de erros, com hierarquia de classes de erro de domínio em vez de códigos soltos. | `backend/src/errors/problem.ts:28-151` (classe abstrata + 8 subclasses); middleware único; **9 testes unitários** parametrizados em `backend/tests/unit/errors/problem.test.ts:104-243` |
| **RNF46** | O sistema deve usar URIs estáveis e centralizadas para os tipos de problema, em vez de strings literais distribuídas. | `PROBLEM_TYPE_NAMESPACE` e função `problemType` em `backend/src/errors/problem.ts:2-7`; teste de estabilidade entre execuções em `problem-details.test.ts:222-231` |
| **RNF47** | O sistema deve validar e normalizar a configuração de ambiente no boot, falhando cedo em configuração inválida, e congelar o resultado. | `backend/src/config/env.ts:57-70` (`Object.freeze`); validadores `:8-18` (NODE_ENV), `:20-28` (PORT), `:30-55` (URLs obrigatórias + protocolo permitido) |
| **RNF48** | O sistema deve gerenciar o schema do banco exclusivamente por migrações versionadas, sem DDL em runtime. | `README.md:82-95`; `backend/prisma/PR_DESCRIPTION.md:9-13,58-67`; `backend/src/config/db.ts:6-8` (comentário: só pool); teste automatizado: `backend/tests/setup/global-setup.ts:29-32` (`prisma migrate deploy` no setup) |
| **RNF49** | O sistema deve fornecer suíte de testes automatizados com separação entre testes unitários (sem infraestrutura) e de integração (com banco real), com construção da aplicação isolada em um único ponto. | Dois projetos Vitest em `backend/vitest.config.ts:28-57` (`unit` `:29-35`, `integration` `:36-55`); `backend/tests/setup/app.ts:9-14` (ponto único de construção); comandos `test`, `test:unit`, `test:integration`, `test:coverage` (`backend/package.json:15-19`) |
| **RNF50** | O sistema deve proteger a suíte de testes contra execução destrutiva em banco de desenvolvimento, recusando rodar se o banco não terminar em `_test`. | `assertBancoDeTeste` em `backend/tests/setup/db.ts:14-31`; llamada no `beforeAll` do setup global (`backend/tests/setup/global-setup.ts:14`) e no teste de Prisma (`backend/tests/integration/prisma-read.test.ts:17`); documentado em `backend/.env.test.example:5-9` |
| **RNF51** | O sistema deve garantir isolamento e independência da suíte de testes, limpando o banco antes de **cada teste** (não de cada arquivo) e desabilitando o paralelismo entre arquivos que compartilham o banco. | `beforeEach(limparBanco)` em `backend/tests/setup/each-test.ts:12-14`; `fileParallelism: false` em `backend/vitest.config.ts:50`; `TRUNCATE ... RESTART IDENTITY CASCADE` com descoberta dinâmica das tabelas em `backend/tests/setup/db.ts:52-64`; teste que prova o isolamento: `backend/tests/smoke/health.test.ts:48-55` |
| **RNF52** | O sistema deve garantir que os testes de integração não dependam de serviços externos de rede. | `backend/src/utils/emailService.ts:15-19,111-120` (caixa de saída de teste em vez de envio); `backend/tests/unit/emailService.test.ts:36-44` (verifica que `createTestAccount` e `createTransport` **não** são chamados); `NODE_ENV=test` desliga rate limit e log de requisição (`backend/src/app.ts:24-28`) |
| **RNF53** | O sistema deve validar automaticamente a aplicação em cada push e pull request, cobrindo instalação, geração do client, migração, tipos, testes e build, para ambas as aplicações. | `.github/workflows/ci.yml` (frontend `:20-36`; backend `:64-84`, incluindo serviço PostgreSQL com health check `:41-54`) |
| **RNF54** | O sistema deve documentar as decisões de arquitetura, as convenções de API e a base de segurança. | `docs/architecture/PROJECT_STRUCTURE.md`; `docs/api/README.md`; `docs/security/README.md`; `docs/decisions/ADR-0001-frontend-backend-typescript.md`; `backend/prisma/PR_DESCRIPTION.md` (202 linhas de PR documentado) |

> **Nota de consistência (débito):** a camada `repositories` está declarada mas **vazia** (`backend/src/repositories/index.ts:1-2`), e os controllers de `design`, `product`, `category`, `stock` e `payment` acessam o banco **diretamente** via `pool.query`, sem abstração. Apenas `auth` e `orders` usam services com Prisma. Ver lacuna L18.

### 7.6 Portabilidade e infraestrutura

| ID | Requisito | Evidência concreta |
|---|---|---|
| **RNF55** | O sistema deve operar sobre PostgreSQL 14 ou superior, configurado exclusivamente por `DATABASE_URL`. | `README.md:64`; `backend/.env.example:8-11`; `backend/src/config/env.ts:60-64` (valida protocolo `postgres:`/`postgresql:`); `backend/prisma/schema.prisma:1-4` |
| **RNF56** | O sistema deve documentar todas as variáveis de ambiente necessárias, sem conter valores reais. | `backend/.env.example` (30 linhas, 8 variáveis); `backend/.env.test.example` (24 linhas); `frontend/.env.example:1` (`VITE_API_URL`) |
| **RNF57** | O sistema deve permitir configuração de SSL para bancos hospedados que o exigem (Supabase ou `DB_SSL=true`). | `backend/src/config/db.ts:22-26` |
| **RNF58** | O sistema deve ser compatível com Node.js 22 e usar o gerenciador de pacotes npm com dependências travadas. | `.nvmrc:1`; `backend/package.json:39-41`, `frontend/package.json` (`package-lock.json` presente); `npm ci` no CI (`.github/workflows/ci.yml:30,74`) |
| **RNF59** | O sistema deve manter o frontend e o backend **independentes em tempo de instalação, build e implantação**, sem dependência de runtime compartilhada. | `README.md:5`; `docs/architecture/PROJECT_STRUCTURE.md:11` ("Não existe dependência de runtime instalada na raiz"); `package-lock.json` da raiz com `"packages": {}`; frontend com config de deploy próprio (`frontend/vercel.json`) |
| **RNF60** | O sistema deve suportar a implantação do backend sem dependência do repositório (artefato compilado autonomouso). | `backend/package.json:8` (`start: node dist/server.js`), `:10` (`build: tsc`), `backend/tsconfig.json:6-7` (`rootDir: src`, `outDir: dist`) |
| **RNF61** | O sistema deve poder executar o frontend como SPA em hospedagem estática, com fallback de rotas. | `frontend/vercel.json:2-7`; `frontend/src/App.tsx:97` (rota `*` → `/`) |

### 7.7 Integração externa

| ID | Requisito | Evidência concreta |
|---|---|---|
| **RNF62** | O sistema deve integrar-se ao gateway de pagamento AbacatePay para cobrança Pix, com degradação automática para o simulador quando o gateway falhar ou não estiver configurado. | Endpoint `https://api.abacatepay.com/v2/billing` em `backend/src/controllers/paymentController.ts:75` e `backend/src/controllers/orderController.ts:289`; payload `frequency: "ONE_TIME"`, `methods: ["PIX"]` (`paymentController.ts:83`); detecção de token mock `:57`; degradação com log `paymentController.ts:109-128` e `orderController.ts:323-328`; teste do degradado: `backend/tests/integration/traceid.test.ts:199-211` |
| **RNF63** | O sistema deve notificar o cliente por e-mail nas transições de status de pedido relevantes, sem bloquear a resposta. | Disparo em `backend/src/controllers/orderController.ts:174-183`; montagem das mensagens `backend/src/utils/emailService.ts:49-88`; **apenas** "In production" (`:58`) e "Delivered" (`:73`) disparam; testes `backend/tests/unit/emailService.test.ts:46-72` |

---

## 8. Lacunas e pontos de incerteza

Esta seção lista explicitamente o que **não** pôde ser determinado pelo código. Nenhum item abaixo deve ser preenchido por suposição no documento final.

### 8.1 Contexto de negócio

| # | Lacuna | Verificação realizada |
|---|---|---|
| **L01** | **Não há documento de visão, proposta de valor, persona ou público-alvo.** Nenhum arquivo do repositório declara quem compra, por quê, nem qual dor o sistema elimina. | Leitura integral de `README.md` (143 linhas), 4 documentos em `docs/`, `backend/prisma/PR_DESCRIPTION.md` (202 linhas) e as 27 mensagens de commit |
| **L02** | **Não há evidência de substituição de ferramenta ou processo manual.** A única referência a sistema anterior é a reorganização de código: *"O projeto anterior misturava a aplicação atual, protótipos, backups e código legado"* (`ADR-0001:8`). Isso descreve dívida de engenharia, **não** problema de negócio. | Idem L01 |
| **L03** | **Não há métrica de sucesso, prazo, escopo deRelease ou sponsorship documentados.** | Idem L01 |
| **L04** | **"Vortex Marketplace"** (`README.md:5`, `ADR-0001:8`) é citado como referência de *organização de repositório*, não como sistema a substituir nem como market de destino. Não está no repositório. | `README.md:5`; `ADR-0001:8,21` |
| **L05** | **Nome do repositório sugere contexto acadêmico** (`n392-Dipoly-opticus`, `package-lock.json:2`), mas **não há nenhuma confirmação no repositório** (nenhum README acadêmico, termo de missão, ementa ou data de entrega). | Verificação completa do repositório |
| **L06** | **"Opticus Eyewear"** aparece como assinatura de e-mail (`backend/src/utils/emailService.ts:68,133`) e no simulador (`backend/src/controllers/paymentController.ts:297`), mas **não há registro de marca, produto comercial ou entidade responsável**. | Idem |
| **L07** | **Não está definido se "fábrica" é um parceiro externo real ou um ator interno.** O schema suporta múltiplas fábricas e o papel `factory` existe, mas não há cadastro, contrato, onboarding nem verificação. | `backend/prisma/schema.prisma:21-25,33`; ausência de CRUD de fábricas |

### 8.2 Escopo e requisitos

| # | Lacuna | Impacto |
|---|---|---|
| **L08** | **Não existe especificação de requisitos formalizada.** O próprio README refere-se à API padronizada como "futura" (`README.md:138`). Os RFs deste relatório foram **extraídos do código**, não de um documento de requisitos — portanto descrevem **o que o sistema faz**, não necessariamente **o que ele deveria fazer**. | Todo o documento de RFs é de natureza descritiva |
| **L09** | **Sem agreement de versionamento de API.** Não há OpenAPI, changelog de rotas nem política de depreciação. Mudanças de contrato (ex.: envelope de sucesso) quebram clientes silenciosamente. | `docs/api/README.md` cobre apenas erros |
| **L10** | **Autorização de objeto é parcial.** Só `PUT /api/orders/:publicId/status` (`orderService.ts:65-77`) e `POST /api/payments/create-billing` (`paymentController.ts:53`) verificam posse. Não há rota `GET /api/designs/:id` individual; `GET /api/payments` é coberto por papel; `GET /api/stock/product/:id` é coberto por papel. **A exigência de `docs/security/README.md:5` (autorizar "toda operação com identificador") não é cumprida de forma uniforme.** | Verificar se a política é escopada a este recurso ou se há lacuna real |
| **L11** | **O contrato de erro estruturado não é consumido pelo frontend.** Nenhuma referência a `detail`, `traceId`, `type` ou `instance` em `frontend/src`; apenas `success` e `error`. Em 6 das 13 chamadas, falhas caem **silenciosamente** em fallback de `localStorage`, sem aviso ao usuário. | `AuthContext.tsx:24,39,144,169,193,215`; `OrderContext.tsx:28,57,87`; `CartContext.tsx:63` |
| **L12** | **Duas convenções de paginação convivem** sem padronização (`{total,page,totalPages}` vs `pagination:{...}`), e nenhuma padroniza o parâmetro de tamanho de página. | `productController.ts:115-121` vs `orderController.ts:141-150` |
| **L13** | **`UpdateUserDTO` declara `email`, `password` e `role`, mas o service os ignora.** Troca de senha e mudança de papel **não são possíveis pela API**. | `backend/src/dtos/auth/update-user.dto.ts:5-7` vs `backend/src/services/authService.ts:150,164-170` |
| **L14** | **Designs são filtrados por `customer_email` e nunca por `usuarioId`**, embora a coluna e o índice existam. Um usuário que trocar de e-mail perde o acesso aos designs. | `backend/src/controllers/designController.ts:33,87,120` vs `backend/prisma/schema.prisma:162,182` |
| **L15** | **Teto de paginação aplicado só em produtos.** `orderController.ts:102`, `paymentController.ts:161` e `stockController.ts:16` aceitam `limit` arbitrário vindo do cliente. | Ver RNF35 |
| **L16** | **`GET /api/products` interpola `LIMIT`/`OFFSET`**, com comentário justificando por bug do `mysql2` — mas **o sistema usa PostgreSQL desde 2026-09-01** (`README.md:82`). O comentário está desatualizado; a exceção é desnecessária. | `backend/src/controllers/productController.ts:84-88` |
| **L17** | **Logging inconsistente:** `handleWebhook` e `confirmSimulatedPayment` usam `console.log`/`console.warn`, e o webhook loga o **payload inteiro** recebido, podendo conter dados do cliente. | `backend/src/controllers/paymentController.ts:203,214,238,360,363` |
| **L18** | **Camada de repositórios declarada e vazia.** 5 dos 7 controllers acessam o banco diretamente. A arquitetura em camadas é parcial e inconsistente entre módulos. | `backend/src/repositories/index.ts:1-2` |
| **L19** | **Duplo mecanismo de acesso a dados em produção:** `pg` (SQL cru) em 5 módulos e Prisma em 2. Isso significa pool duplo, SQL não coberto pelos tipos do Prisma e `publicId`Stories que só funcionam no SQL cru por causa do `DEFAULT gen_random_uuid()` adicionado manualmente na migration. | `backend/prisma/PR_DESCRIPTION.md:52-56` (justificativa explícita do `DEFAULT`) |
| **L20** | **Concorrência otimista incompleta:** o campo `version` existe em `Pedido` e `Estoque` (`schema.prisma:88,125`) e é **incrementado** a cada atualização de status (`orderService.ts:75`), mas **nunca é lido como condição** — não há proteção contra lost update. A comment `orderService.ts:74` admite que é "preparação" para um requisito futuro (CONC-02). | `backend/tests/integration/orders-status-bola.test.ts:36,56` verificam incremento, mas não concorrência |
| **L21** | **Modelo `PedidoItem` existe no schema e na migration, mas é integralmente não utilizado** — nenhum controller, service ou teste o referencia. O `Pedido` transporta apenas `productName` + `customSpecs` em JSON. | `backend/prisma/schema.prisma:103-116`; grep sem resultado em `src/` e `tests/` |
| **L22** | **Preço é confiado ao cliente (SEC-05, débito reconhecido pela própria equipe).** `total` vem do corpo em RF25 e RF26 sem recálculo no servidor. | `backend/tests/helpers/orders.ts:6-7`; `backend/src/controllers/orderController.ts:19,47,224,247` |
| **L23** | **`GET /api/orders` filtra `client` por `customer_email`, não por `usuarioId`**, apesar do índice `idx_pedidos_usuario` existir sobre `usuario_id`. Mesma fragilidade de L14. | `backend/src/controllers/orderController.ts:109,112` |
| **L24** | **Não há `GET /api/orders/:publicId`** (detalhe individual). A galeria de designs e o carrinho funcionam sem ele, mas qualquer evolução precisará do endpoint. | `backend/src/routes/orderRoutes.ts:9-12` |
| **L25** | **Não há `GET /api/products/:publicId`** — a proteção de IDOR em produtos (RNF12) só foi aplicada a `Pedido`. Produtos, categorias e estoque usam id sequencial exposto na URL. | `backend/src/routes/productRoutes.ts:20,24,25`; `categoryRoutes.ts:20,24,25`; `stockRoutes.ts:23,26` |
| **L26** | **Não há atualização de design (`PUT /api/designs/:id`)** — o `saveDesign` faz upsert condicional, o que é funcionalmente equivalente, mas a semântica não está documentada. | `backend/src/controllers/designController.ts:31-56` |
| **L27** | **`AGENTS.md` é citado 4 vezes no código (§5 e §10) mas não existe no repositório.** As regras de engenharia que orientaram os testes (matriz BOLA, guarda de banco de teste, cobertura sem omissões) estão **órfãs de documento**. | `backend/vitest.config.ts:7,17`; `backend/tests/setup/db.ts:10`; `backend/tests/integration/orders-status-bola.test.ts:4` |
| **L28** | **Não há lint, formatação automática nem pre-commit hook** em nenhum dos dois projetos. `backend/tests/integration/problem-details.test.ts:79` contém `// eslint-disable-next-line no-throw-literal` — herança de um setup de ESLint que não existe mais no repositório. | `backend/package.json:25-57`; `frontend/package.json:13-30` |
| **L29** | **Cobertura de testes concentrada e majoritariamente em caminhos de erro.** 10 dos 33 endpoints são alcançados por alguma requisição de teste, mas apenas **3 têm asserção de caminho de sucesso** (`GET /health`, `GET /api/auth/me` e `PUT /api/orders/:publicId/status`); os outros 7 são cobertos só por falha (404 de categoria, 409 de unicidade de design, 409 de FK no checkout, 500 sem vazamento no `create-billing`, 403 por papel na listagem de usuários, 400/409 no registro e 401 anônimo). `POST /api/auth/login` é exercitado apenas como fixture de token pelo helper `obterToken` (`backend/tests/helpers/auth.ts:79-93`), sem nenhum caso de senha incorreta ou payload inválido. **Produtos e estoque não têm nenhum teste de rota**, e `GET /api/payments` não tem nenhum. | `backend/tests/` (7 arquivos de teste, dos quais 4 focam middleware/erros/dados, não regra de negócio); contagem por requisição em `backend/tests/**/*.test.ts` e `backend/tests/helpers/auth.ts` |
| **L30** | **Testes de frontend: apenas 5 casos de uma função pura de preço.** Nenhum teste de componente, integração ou E2E. | `frontend/src/tests/pricing.test.ts:1-41` |
| **L31** | **`templeOpen` (abertura da haste) é inefetivo no 3D** — o `useEffect` de montagem tem array de dependências vazio e o `animate()` captura o valor inicial. O slider existe na UI mas não altera a cena. | `frontend/src/components/creator/ThreePreview.tsx:195,222,241-247` |
| **L32** | **"EDIT IN STUDIO" não recarrega o design.** A chave `opticus_active_design` é gravada pela galeria, mas nenhum componente do Creator Studio a lê; o que é restaurado é o rascunho (`opticus_creator_draft`). | `frontend/src/components/DesignsGallery.tsx:17` vs ausência de leitura no Studio |
| **L33** | **O provador virtual é 2D (Canvas), não 3D, e as "AI suggestions" são regras `if/else` fixas**, apesar da rotulagem de "Live Face Analysis". A detecção facial (MediaPipe FaceLandmarker) é real. | `frontend/src/components/creator/TryOnViewport.tsx:36-43,72-85,87-128` |
| **L34** | **Violação da regra de hooks do React** em ambos os dashboards: `return` antecipado antes de `useState`. | `frontend/src/components/Dashboards.tsx:127-129` vs `:131-134`; `:357-359` vs `:361-364` |
| **L35** | **Autorização no frontend é 100% client-side** (redirect por `useEffect` + "Access denied" no render). As rotas são registradas no `<Routes>` sem guarda. Isso é aceitável **desde que** o backend também autorize — o que ele faz (RNF10/RNF11) — mas a UI não é um limite de segurança. | `frontend/src/App.tsx:39-52,89-98`; `Dashboards.tsx:127-129,357-359` |
| **L36** | **`Published` de designs não tem efeito funcional.** Sempre `false`, sem UI de publicação, e o Marketplace não lê designs de terceiros. A comunidade de designs é, portanto, um objetivo **não implementado**. | `frontend/src/components/creator/CreatorModals.tsx:63`; `frontend/src/components/Marketplace.tsx:77-80,148-150` |
| **L37** | **Símbolo de moeda inconsistente na UI:** `$` no Marketplace, `R$` no carrinho; e o dashboard oferece câmbio com taxas **hardcoded** (BRL 5.15, EUR 0.92). Não há decisão de moeda documentada. | `frontend/src/components/Marketplace.tsx:330`; `frontend/src/components/Cart.tsx:253,329`; `Dashboards.tsx:8-12` |
| **L38** | **SLA de produção de 30 dias é hardcoded no frontend**, sem regra no backend. | `frontend/src/components/Dashboards.tsx:42-54` |
| **L39** | **E-mail em inglês; toda a restante messages em português.** Sem decisão de idioma por canal documentada. | `backend/src/utils/emailService.ts:60,75` vs `backend/src/errors/problem.ts:69,79,88` |
| **L40** | **Serviço de e-mail de produção é Ethereal** (`smtp.ethereal.email`), um provedor descartável — as mensagens **não chegam** a destinatários reais. Não há SMTP configurável. | `backend/src/utils/emailService.ts:29-39` |
| **L41** | **`backend/.env.test` existe em disco com credenciais** (usuário/senha de Postgres de teste) e está corretamente **não rastreado** pelo Git. Não é violação, mas o arquivo real de ambiente está presente no diretório de trabalho. | `.gitignore:33-46`; `git ls-files` confirma não-rastreamento |
| **L42** | **Não há nenhum Dockerfile nem configuração de infraestrutura** para o backend. O CI cria o banco como serviço efêmero, mas o processo de deploy não está definido. | Varredura completa; `frontend/vercel.json` é a única config de deploy |

---

## 9. Apêndice A — Matriz de rastreabilidade arquivo→RF

| Arquivo | RFs associated | Linhas |
|---|---|---|
| `backend/src/app.ts` | RF01 + montagem de todos | 103-113 |
| `backend/src/routes/authRoutes.ts` | RF02–RF07 | 20-27 |
| `backend/src/controllers/authController.ts` | RF02–RF07 | 4-34 |
| `backend/src/services/authService.ts` | RF02–RF06 | 41-185 |
| `backend/src/routes/categoryRoutes.ts` | RF08–RF12 | 19-25 |
| `backend/src/controllers/categoryController.ts` | RF08–RF12 | 14-150 |
| `backend/src/routes/productRoutes.ts` | RF13–RF17 | 19-25 |
| `backend/src/controllers/productController.ts` | RF13–RF17 | 15-220 |
| `backend/src/routes/stockRoutes.ts` | RF18–RF21 | 21-26 |
| `backend/src/controllers/stockController.ts` | RF18–RF21 | 14-194 |
| `backend/src/routes/designRoutes.ts` | RF22–RF24 | 10-12 |
| `backend/src/controllers/designController.ts` | RF22–RF24 | 14-129 |
| `backend/src/routes/orderRoutes.ts` | RF25–RF28 | 9-12 |
| `backend/src/controllers/orderController.ts` | RF25–RF27 | 17-340 |
| `backend/src/services/orderService.ts` | RF28 | 46-108 |
| `backend/src/routes/paymentRoutes.ts` | RF29–RF33 | 19-29 |
| `backend/src/controllers/paymentController.ts` | RF29–RF33 | 36-373 |

### Cobertura de testes por RF

| RF | Coberto por teste? | Teste |
|---|---|---|
| RF01 | Sim | `backend/tests/smoke/health.test.ts:16-21` |
| RF02 | Parcial (via fixture e conflito) | `problem-details.test.ts:271-287`; `tests/helpers/auth.ts:49-57` |
| RF03 | Parcial (via fixture) | `tests/helpers/auth.ts:79-93` |
| RF04 | Sim | `backend/tests/smoke/health.test.ts:36-40` |
| RF05 | Parcial (403 por papel) | `problem-details.test.ts:262-269`; `health.test.ts:65-69` |
| RF06, RF07 | **Não** | — |
| RF08–RF12 | Parcial (404 de categoria) | `problem-details.test.ts:250-254` |
| RF13–RF17 | **Não** | — |
| RF18–RF21 | **Não** | — |
| RF22 | Parcial (409 em duplicidade) | `problem-details.test.ts:289-305` |
| RF23, RF24 | **Não** | — |
| RF25 | **Não** | — |
| RF26 | Sim (caminho de erro) | `traceid.test.ts:213-239` |
| RF27 | **Não** | — |
| **RF28** | **Sim (8 casos, cobertura completa da matriz BOLA)** | `backend/tests/integration/orders-status-bola.test.ts:22-169` |
| RF29 | Parcial (caminho de erro) | `traceid.test.ts:199-211` |
| RF30–RF33 | **Não** | — |

**Total: 3 RF com cobertura direta de caminho de sucesso (RF01, RF04, RF28), 11 com cobertura parcial (apenas caminho de erro ou via fixture) e 19 sem cobertura de rota.**

---

## 10. Apêndice B — Inventário de dados mockados

Relevante para a seção "Escopo e Delimitação": partes do sistema cuja aparência de funcionalidade não corresponde a dados de produção.

| # | Dado | Onde | Natureza |
|---|---|---|---|
| M01 | Catálogo de 4 produtos do Marketplace | `frontend/src/components/Marketplace.tsx:26-59` | Array literal; **ignora a API de produtos** |
| M02 | Tabela de precificação completa | `frontend/src/utils/pricing.ts:1-26` | Cálculo 100% client-side; sem lastro no backend |
| M03 | Fábrica de demonstração `"factory-demo"` / `"Demo Factory"` | `frontend/src/components/DesignsGallery.tsx:52-53` | Identificador inexistente no banco |
| M04 | Fallback de nome de fábrica `"Opticus Partner"` | `frontend/src/components/Cart.tsx:171` | String fixa |
| M05 | Taxas de câmbio (USD 1 / BRL 5.15 / EUR 0.92) | `frontend/src/components/Dashboards.tsx:8-12` | Constantes |
| M06 | SLA de produção de 30 dias | `frontend/src/components/Dashboards.tsx:42-54` | Constante |
| M07 | Dimensões dos 3 modelos 3D | `frontend/src/components/creator/ThreePreview.tsx:41-45` | Catálogo hardcoded; deveria ser dado |
| M08 | Estatísticas de marketing do hero | `frontend/src/components/Marketplace.tsx:190-202` | Números literais sem fonte |
| M09 | Simulador de checkout Pix (QR Code desenhado por CSS) | `backend/src/controllers/paymentController.ts:288` | **Backend** — QR decorativo, não funcional |
| M10 | Seed de desenvolvimento (usuários, produto, pedido fake) | `backend/prisma/seed.dev.ts` | Marcado "NÃO rode em produção" (`:1-13`) |
| M11 | "AI suggestions" do provador virtual | `frontend/src/components/creator/TryOnViewport.tsx:72-85` | Regras `if/else` apresentadas como análise facial |
| M12 | Login social Google | `frontend/src/components/AuthPage.tsx:189` | `alert()` |
| M13 | Candidatura a parceiro | `frontend/src/components/AuthPage.tsx:278` | `alert()` |
| M14 | Pedidos persistidos em `localStorage` como fallback silencioso | `frontend/src/contexts/OrderContext.tsx:12-15,61-69` | Mascara falha da API |
| M15 | Designs em `localStorage` como fallback silencioso | `frontend/src/contexts/AuthContext.tsx:36,65-66` | Mascara falha da API |

---

## Fim do levantamento

**Resumo quantitativo para dimensionamento da redação:**

| Métrica | Valor |
|---|---|
| Endpoints mapeados | **33** |
| Módulos de negócio (backend) | **7** (+ saúde) |
| Requisitos Funcionais | **33** (RF01–RF33) |
| Requisitos Não Funcionais | **63** (RNF01–RNF63) |
| Modelos de dados | 8 tabelas + 4 enums (`backend/prisma/schema.prisma`) |
| Papéis de usuário | 3 (`client`, `factory`, `staff`) |
| Estados de pedido | 5 (`backend/prisma/schema.prisma:65-71`) |
| Testes automatizados | 7 arquivos (`backend/tests/`) + 1 (`frontend/src/tests/`) |
| Commits no histórico | 24 (`git rev-list --count HEAD` no branch `feat/stop-leaking-internal-errors`) |
| Lacunas documentadas | **42** (L01–L42) |
| Itens mockados | **15** (M01–M15) |
| RFs sem cobertura de rota | **19 de 33** (58%) |

**Ordem de prioridade sugerida para a seção de lacunas do documento final:** L08 (ausência de especificação formal) e L01 (ausência de contexto de negócio) são as duas que mais restringem o que pode ser afirmado; em seguida L22 (preço confiado ao cliente) e L36 (comunidade de designs não implementada), por serem os desvios mais relevantes entre a capacidade aparente e a efetiva.
