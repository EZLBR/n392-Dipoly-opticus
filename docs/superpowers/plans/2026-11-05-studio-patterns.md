# STUDIO-05 (#86) — padrões procedurais da armação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir escolher padrão, escala, orientação e cor secundária na armação, mantendo o resultado em todos os previews e no design salvo.

**Architecture:** Um campo opcional versionado surfacePattern integra EyewearConfig e o DTO canônico existente. O mesmo gerador procedural cria DataTextures usadas pelo material da armação no viewer compartilhado; ausência do campo mantém os materiais anteriores.

**Tech Stack:** React, TypeScript, Three.js, Zod, Vitest, Testing Library; nenhuma dependência nova.

**Spec:** issue #86, consultada em 05/11/2026; decisão do Enzo nesta conversa: seguir direto e decidir detalhes pelos critérios, consultando apenas mudanças de escopo/segurança/custo. Catálogo escolhido pelo executor: listras, pontos e xadrez, além de nenhum; todos apenas visuais até aprovação fabril.

## Global Constraints

- Não alterar lentes, receitas, agenda ou regras de pagamento.
- Preservar materiais sólidos, tartaruga, cristal, madeira e carbono quando surfacePattern.style=none ou ausente.
- surfacePattern={version:1,style:none|stripes|dots|checker,scale:1..6,rotation:-180..180,ink:#RRGGBB}; padrão none, escala 2, rotação 0 e ink #f7f0db.
- Cores de base vêm de config.color. Parâmetros inválidos são normalizados no cliente e rejeitados no servidor, sem silenciosamente aceitar outro schema de versão.
- Campos opcionais de dados legados ganham padrão none, nunca novo efeito visual.
- Manter o campo na serialização, no salvamento e nas atualizações legadas sem perdê-lo.
- Nenhum asset enviado pelo usuário, dependência de #13/#14 ou habilitação de fabricação por este padrão.
- Execução direta já autorizada, sem outra parada para aprovação de plano; revisão independente final obrigatória.

## Review Focus

- Dados antigos e nulos não ganham padrão acidentalmente.
- Valor não finito, cor inválida e versão desconhecida não atravessam validação do servidor.
- Mudar controles não altera lente nem precisa reconstruir geometria.
- Trocar nenhum↔padrão restaura o material original sem vazamento de texturas.
- Reabrir documento salvo e fazer atualização legada mantém padrão e parâmetros.

### Task 1: configuração e persistência canônicas

**Files:** frontend/src/eyewear/patterns.ts (novo), config.ts; backend/src/dtos/design/studio-config.dto.ts e services/designConfig.ts; testes frontend/src/tests/patterns.test.ts e backend/tests/integration/studio-config.test.ts.

**Interfaces:** normalizeSurfacePattern(input:unknown):SurfacePattern; patternStyles readonly enum; EyewearConfig.surfacePattern:SurfacePattern. DTO aceita campo opcional compatível com config antiga; helper legado resolveStudioConfig mantém campo anterior.

- [ ] Escrever teste normalizando documento legado → style none, e documento com checker/scale 3/rotation 45/ink #aabbcc → valores preservados após JSON/normalizeConfig. Testar clamps, não finitos, versão desconhecida.
- [ ] Rodar npm test -- src/tests/patterns.test.ts no frontend, observar RED pelo campo ausente.
- [ ] Implementar normalizador/config e schema opcional com defaults sem mexer nas outras propriedades.
- [ ] Adicionar integração criando config com padrão, lendo em nova requisição e atualizando sem config completa; exigir preservação. Testar style/scale/rotation/ink inválidos → 400.
- [ ] Rodar teste frontend e integração focada, depois suítes completas de cada projeto; exigir GREEN.
- [ ] Commit: feat(studio): persist versioned surface patterns.

### Task 2: material e renderização compartilhados

**Files:** frontend/src/eyewear/materials.ts e patterns.ts; frontend/src/tests/patterns.test.ts.

**Interfaces:** createPatternTexture(pattern:SurfacePattern,baseColor:string):THREE.DataTexture. createMaterials().update(config) seleciona textura customizada só para a armação e mantém descarte pelo dispose existente.

- [ ] Testar que padrão cria pixels de duas cores, parâmetros mudam repetição/orientação e a lente fica igual. Testar style none retomando mapa/material anterior e descarte de textura ao atualizar/desmontar.
- [ ] Rodar teste focado; esperar RED porque material ignora surfacePattern.
- [ ] Implementar três padrões determinísticos em buffer RGBA 256x256, repetição/rotação limitadas e descarte apenas de mapas próprios. Nenhuma textura externa.
- [ ] Rodar suíte frontend completa e typecheck/build; exigir GREEN.
- [ ] Commit: feat(studio): render frame patterns consistently.

### Task 3: controles e entrega

**Files:** frontend/src/components/creator/CustomizationPanel.tsx; frontend/src/tests/pattern-panel.test.tsx (novo); docs/superpowers/specs/2026-11-05-studio-patterns-design.md (registro curto).

**Interfaces:** controles usam useCreatorStudio().patchConfig({surfacePattern}) e labels pt/en; grupo de materiais existente preservado, preview reage pelo viewer canônico já usado no Studio/miniaturas.

- [ ] Testar seleção de checker, escala 3, orientação 45 e cor secundária; verificar rascunho persistido, mensagem de apenas visual, ausência de edição de lentes por este grupo e restauração após remontar.
- [ ] Rodar teste e observar RED antes de inserir controles.
- [ ] Acrescentar grupo ao painel existente, com opções Nenhum/Listras/Pontos/Xadrez e aviso de fabricação não validada; controles com labels e teclado nativos.
- [ ] Rodar suítes completas frontend/backend, typecheck/build e git diff --check. Registrar limitações de ambiente visual se ocorrerem, não chamar issue Done antes de integração.
- [ ] Commit: feat(studio): expose frame pattern controls.

## Auto-revisão

Critérios da #86 mapeados: catálogo/preview (2/3), limites (1/2), persistência/compatibilidade (1), informação de fabricação (3), testes normalização/materiais (1/2). Sem chamada de API nova; nenhum conflito com autorização de designs reservada ao João Pedro.
