# syntax=docker/dockerfile:1

# ============================================================
#   OPTICUS FRONTEND — imagem de produção
#
#   Estágios:
#     build    instala dependências, verifica tipos e gera o bundle do Vite
#     runtime  nginx sem privilégios servindo apenas os arquivos estáticos
#
#   docker build -t opticus-frontend ./frontend
#   docker build --build-arg VITE_API_URL=https://api.exemplo.com/api -t opticus-frontend ./frontend
#
#   A imagem final não contém Node, código-fonte nem node_modules.
# ============================================================

ARG NODE_VERSION=22

# ── build ────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Endereço público da API. O Vite substitui `import.meta.env.VITE_API_URL`
# no bundle durante o build — trocar o endereço exige gerar nova imagem.
# Não é segredo: qualquer um lê esse valor no JavaScript entregue ao
# navegador. Nunca passe credenciais por variáveis VITE_*.
ARG VITE_API_URL=http://localhost:5000/api
ENV VITE_API_URL=${VITE_API_URL}

# O script de build roda `tsc --noEmit` antes do Vite: a imagem só é
# gerada se os tipos estiverem corretos, como na esteira.
RUN npm run build

# ── runtime ──────────────────────────────────────────────────
# nginx-unprivileged roda como o usuário `nginx` (não-root) e escuta na
# porta 8080, já que processos sem privilégio não abrem portas abaixo de 1024.
FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ > /dev/null || exit 1
