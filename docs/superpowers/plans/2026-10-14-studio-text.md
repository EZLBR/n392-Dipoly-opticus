# Studio text implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Entregar #82, #4 e o editor de texto #83.
**Architecture:** Cache ligado à identidade; checkout com fetch autenticado; configuração versionada JSONB; texto projetado apenas na armação, com editor integrado ao Studio atual.
**Tech Stack:** React, Three.js, Express 5, Zod, PostgreSQL/Prisma migrations, Vitest.
**Spec:** ../specs/2026-10-14-studio-text-design.md

## Global constraints

- Lentes não recebem arte; nenhuma compra com arte até aprovação da fábrica.
- Máximo 6 camadas e 24 caracteres por texto; x/y -1..1, size 0.25..1, rotation -30..30; fontes sans/serif/mono.
- Documentos e artwork têm version 1; migração aditiva e compatibilidade com designs anteriores.
- Preservar contratos da dev e trabalhos externos à branch.

## Review focus

- Respostas atrasadas: não podem escrever em outra conta.
- Design antigo: ausência de config recupera os padrões legados.
- Texto longo/perfil fino: arte deve ficar na região disponível, sem alcançar lentes.
- Erro de servidor: salvamento local deve ser identificado como local.
- Entrada direta de pedido: servidor rejeita camadas de arte mesmo sem passar pelo Studio.

### 1. Isolamento de contas (#82)

Files: eyewear/storage.ts, contexts/AuthContext.tsx, contexts/CreatorStudioContext.tsx, tests/auth-designs.test.tsx.

- [x] Reproduzir troca de conta e resposta atrasada com testes do AuthProvider.
- [x] Implementar switchStudioOwner(storage, owner), limpar dados privados, preservar workspace anônimo e invalidar resultados de outra sessão.
- [x] Executar testes de sessão e designs.
- [x] Cobrir também estado do Studio montado e cache legado sem dono.

### 2. Checkout privado (#4)

Files: backend/routes/paymentRoutes.ts, controllers/paymentController.ts, integration/simulated-checkout.test.ts; frontend/components/Cart.tsx.

- [x] Testar anônimo 401 sem dados, dono 200 e não-dono 404 com banco dedicado.
- [x] Exigir routerGuard e escopo usuario_id na consulta.
- [x] Abrir HTML por fetch autenticado em iframe sandbox, sem token em query string.
- [x] Executar testes e revisar navegação.

### 3. Documento persistente (#83)

Files: frontend/eyewear/config.ts + artwork.ts; backend/dtos/design/design.dto.ts + studio-config.dto.ts, controllers/designController.ts, prisma/schema.prisma e migration; respectivos testes.

- [x] Testar default legado, normalização e limites das camadas; testar API inválida e round trip sem cache local.
- [x] Definir TextLayer/Artwork e normalizeArtwork(input); adicionar versão/config ao schema da API.
- [x] Criar migration aditiva, persistir JSONB nas duas operações e retornar config na listagem.
- [x] Tornar documento remoto autoritativo para designs sincronizados, preservando edições locais pendentes; executar testes de persistência.

### 4. Preview e editor (#83)

Files: eyewear/artwork-renderer.ts, EyewearViewer.tsx, creator/ArtworkPanel.tsx, CustomizationPanel.tsx, studio.css e testes.

- [x] Testar projeção apenas em aro/haste, atualização/descarte e controle de camadas pela interface.
- [x] Implementar renderer de decals sobre os meshes existentes; anexar às hastes para acompanhar dobra.
- [x] Integrar etapa Arte, edição de camada e parâmetros limitados em português/inglês.
- [x] Bloquear sacola com arte na interface e pedidos equivalentes no backend, com teste.

### 5. Verificação e entrega

- [x] Rodar suíte completa, typecheck e build de ambos os pacotes.
- [x] Revisar diff, migrations e ausência de dados privados versionados.
- [x] Abrir frontend e validar texto, salvamento e tela pequena; registrar limitações reais.
- [x] Preparar entrega local da branch/commit e resultado verificável, sem marcar issue concluída ou publicar PR antes da decisão de integração.
