# syntax=docker/dockerfile:1

# ============================================================
#   OPTICUS BACKEND — imagem de produção
#
#   Estágios:
#     base       node + OpenSSL (exigido pelo motor do Prisma)
#     deps       todas as dependências, inclusive a CLI do Prisma
#     build      gera o Prisma Client e compila o TypeScript
#     prod-deps  somente dependências de produção
#     migrate    alvo auxiliar: aplica migrations e roda seeds
#     runtime    imagem final (padrão): sem compilador, sem CLI, sem testes
#
#   Imagem da API:        docker build -t opticus-backend ./backend
#   Imagem de migrations: docker build --target migrate -t opticus-backend-migrate ./backend
#
#   Nenhum segredo entra na imagem. DATABASE_URL, JWT_SECRET e demais
#   variáveis são fornecidas na execução (docker run -e / --env-file).
# ============================================================

ARG NODE_VERSION=22

# ── base ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
# O motor do Prisma é carregado como biblioteca nativa e depende do
# OpenSSL. Build e runtime partem desta mesma base, então o motor gerado
# no build é exatamente o que o runtime vai carregar.
RUN apk add --no-cache openssl
WORKDIR /app

# ── deps ─────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
# O postinstall do projeto executa `prisma generate`, que precisa do schema.
COPY prisma ./prisma
RUN npm ci

# ── build ────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate \
 && npm run build

# ── prod-deps ────────────────────────────────────────────────
FROM base AS prod-deps
COPY package.json package-lock.json ./
# --omit=optional: a CLI do Prisma é devDependency, mas também é peer
# OPCIONAL do @prisma/client — o lockfile a marca como `devOptional`, e
# `--omit=dev` sozinho a instala mesmo assim. Omitir os opcionais tira a
# CLI e o motor de migrations da imagem final (49 MB → 18 MB de
# node_modules). O único outro opcional da árvore é o pg-cloudflare, que
# só serve em Cloudflare Workers.
#
# --ignore-scripts: o postinstall do projeto chama `prisma generate`, e o
# schema não existe neste estágio. O client já gerado, com o motor nativo,
# é copiado do estágio de build.
RUN npm ci --omit=dev --omit=optional --ignore-scripts

# ── migrate ──────────────────────────────────────────────────
# Migrations são um passo próprio do deploy, nunca executado no boot da
# API. Este alvo tem a CLI do Prisma, as migrations e os seeds.
#
#   docker run --rm -e DATABASE_URL=... opticus-backend-migrate
#   docker run --rm -e DATABASE_URL=... opticus-backend-migrate npx prisma db seed
FROM deps AS migrate
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ── runtime ──────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=5000

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

# Os arquivos pertencem ao root e o processo roda como `node`: a aplicação
# lê o próprio código, mas não consegue reescrevê-lo se for comprometida.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

# Forma exec: o node é o PID 1 e recebe o SIGTERM do `docker stop`
# diretamente — o server.ts fecha o servidor e o pool antes de sair.
CMD ["node", "dist/server.js"]
