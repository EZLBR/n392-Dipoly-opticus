# Sprint 4 — correções de frontend do Enzo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as issues #35, #38 e #34 sem sucesso fictício, tela branca por cache inválido ou mudança da ordem dos hooks.

**Architecture:** Preservar os providers e o cliente HTTP central existentes. Corrigir o ponto de leitura do cache e os retornos dos dashboards; manter rascunhos locais explícitos do Studio, mas nunca transformar uma rejeição HTTP em salvamento local ou atualização de pedido bem-sucedida.

**Tech Stack:** React 19, TypeScript, Vitest 4, Testing Library, jsdom; sem dependências novas.

**Spec:** [#35 FE-06](https://github.com/EZLBR/n392-Dipoly-opticus/issues/35), [#38 FE-04](https://github.com/EZLBR/n392-Dipoly-opticus/issues/38) e [#34 FE-03](https://github.com/EZLBR/n392-Dipoly-opticus/issues/34), consultadas em 24/10/2026.

**Execução:** aprovada em 24/10/2026, diretamente nesta conversa. Tasks 1–3 implementadas com regressões RED→GREEN; revisão independente encontrou três problemas na exclusão, corrigidos em uma rodada com quatro regressões RED→GREEN. Verificação final: 110 testes frontend, typecheck e build aprovados; somente o aviso preexistente de chunks grandes. Decisão de integração pendente. A escolha de volume privado para #84 foi aprovada separadamente, sem incluir sua implementação neste plano.

## Global Constraints

- Trabalhar sobre origin/dev 883fff772dc54a775749e4e2f53ab6cb8d5853a4, na branch fix/sprint-4-enzo-frontend, em checkout isolado já existente.
- Não alterar regras de negócio, backend, pagamentos, lentes ou a distribuição de trabalho de outros membros.
- Nunca modificar sources/; nunca incluir segredos ou .env nos commits.
- JSON corrompido de opticus_orders deve ser descartado e registrado sem logar seu conteúdo.
- Rejeição HTTP não pode gravar estado otimista no localStorage; indisponibilidade de rede e rejeição são situações distintas.
- Rascunhos locais explícitos do Studio e isolamento por conta continuam funcionando.
- #84 STUDIO-03 fica fora deste plano até aprovação de armazenamento, limites e acesso privado; depende do alinhamento das #13/#14.

## Review Focus

- JSON sintaticamente válido, mas não-array: provider continua com lista vazia.
- Storage inacessível ou falha na limpeza do item: provider não derruba a aplicação nem vaza conteúdo privado no log.
- Transição sessão nula → autorizada → nula em ambos os dashboards: sem erro de hooks nem dados protegidos sem sessão.
- Respostas HTTP 401/403/422/500: não mudam pedidos/designs/cache como se a mutação tivesse sido aceita.
- Rejeição sem acesso à rede ou resposta atrasada após troca de conta: pedidos não são simulados e os rascunhos do Studio não vazam entre contas.

## Task 1 — #35: inicialização resiliente dos pedidos

**Files:** Modify frontend/src/contexts/OrderContext.tsx; Create frontend/src/tests/order-cache.test.tsx.

**Interfaces:** OrderProvider e useOrder continuam expondo orders como lista; não criar API pública nova para testes.

- [ ] Escrever testes que montam o provider com opticus_orders contendo JSON inválido, objeto/null e array válido; verificar saída do consumidor, remoção do item inválido e log sem conteúdo do cache. Cobrir getItem/removeItem lançando exceção.
- [ ] Rodar npm test -- src/tests/order-cache.test.tsx; confirmar falha pela leitura/parse atual, não por mock incorreto.
- [ ] Proteger leitura/parse, validar Array.isArray, remover cache corrompido em bloco protegido e registrar aviso sem o payload.
- [ ] Repetir o teste focado; exigir todos aprovados.
- [ ] Commit: fix(frontend): recover from invalid order cache.

## Task 2 — #38: ordem estável de hooks nos dashboards

**Files:** Modify frontend/src/components/Dashboards.tsx; Create frontend/src/tests/dashboards.test.tsx.

**Interfaces:** FactoryDashboard e StaffDashboard mantêm exports, permissões e cálculos atuais.

- [ ] Testar ambos os componentes com consumidor de sessão controlado: null → perfil permitido → null, e perfil não permitido → permitido. Assertar cabeçalhos/dados reais e ausência de tela de erro; não testar componentes de gráficos por mock.
- [ ] Rodar npm test -- src/tests/dashboards.test.tsx e confirmar a falha pela ordem atual de hooks.
- [ ] Mover somente os useState para antes dos retornos condicionais. Não acessar session.id antes da verificação de acesso.
- [ ] Repetir o teste focado; exigir todos aprovados.
- [ ] Commit: fix(frontend): keep dashboard hooks unconditional.

## Task 3 — #34: falhas explícitas e cache fiel ao servidor

**Files:** Modify frontend/src/contexts/OrderContext.tsx, frontend/src/contexts/AuthContext.tsx, frontend/src/components/Dashboards.tsx, frontend/src/components/creator/CreatorModals.tsx, frontend/src/components/DesignsGallery.tsx; Create frontend/src/tests/server-rejections.test.tsx; Extend frontend/src/tests/auth-designs.test.tsx.

**Interfaces:** updateOrderStatus(orderId, newStatus) retorna Promise<{ok: true} | {ok: false; error: string}>; consumidores exibem error e mantêm o pedido anterior. saveDesign mantém retorno existente em sucesso e lança ProblemError em rejeição HTTP; falha de transporte permite apenas o rascunho já explicitamente marcado syncStatus: local. deleteBackendDesign comunica falha ao chamador antes de limpar a seleção ativa.

- [ ] Criar testes com fetch real interceptado na fronteira HTTP: 403 e outros HTTP de erro não alteram pedido/cache; falha de transporte não simula status; sucesso somente atualiza após leitura canônica do servidor.
- [ ] Cobrir saveDesign com HTTP 403/422/500 sem alterar lista/cache/seleção, falha de rede com rascunho local identificado e sucesso remoto sincronizado; preservar teste de isolamento entre contas.
- [ ] Cobrir UI: aviso visível no dashboard e modal de salvar, sem fechar modal como sucesso; falha de exclusão não limpa seleção nem remove design.
- [ ] Rodar npm test -- src/tests/server-rejections.test.tsx src/tests/auth-designs.test.tsx src/tests/dashboards.test.tsx e confirmar falhas relevantes antes de alterar produção.
- [ ] Remover fallback de status de pedido; distinguir ProblemError de indisponibilidade de transporte; propagar rejeição HTTP no salvamento/exclusão de design; mostrar mensagens nos consumidores existentes. Não substituir rascunhos locais honestos por falsa sincronização.
- [ ] Rodar testes focados e suíte frontend inteira; corrigir regressões da mudança.
- [ ] Rodar npm run typecheck, npm run build e git diff --check; registrar quaisquer avisos preexistentes.
- [ ] Commit: fix(frontend): preserve server rejections without local success.

## Handoff

- [ ] Revisar diff final e solicitar revisão independente conforme o fluxo de execução escolhido.
- [ ] Entregar commits, testes e resumo das três issues; não marcar Done antes de integração verificada à dev.
- [ ] Refinar #84 separadamente: decidir persistência privada e limites antes de implementar upload/recorte/projeção.
