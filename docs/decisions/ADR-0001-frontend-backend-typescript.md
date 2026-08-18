# ADR-0001: Frontend e backend separados em TypeScript

- Status: aceito
- Data: 2026-08-17

## Contexto

O projeto anterior misturava a aplicação atual, protótipos, backups e código legado. A equipe decidiu adotar a organização já utilizada no Vortex Marketplace e trabalhar somente com as branches `dev` e `main`.

## Decisão

Manter duas aplicações independentes:

- `frontend/`: React e Vite em TypeScript;
- `backend/`: Express e PostgreSQL em TypeScript.

Código legado e backups não fazem parte do novo repositório. Cada aplicação possui dependências, build e verificação de tipos próprios.

## Consequências

- frontend e backend podem ser instalados e implantados separadamente;
- a esteira valida os dois projetos antes da promoção para produção;
- contratos HTTP precisam ser documentados para evitar divergência entre as aplicações;
- regras de autorização e acesso a dados permanecem exclusivamente no backend.
