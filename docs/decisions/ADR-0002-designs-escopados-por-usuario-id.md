# ADR-0002: Designs escopados por `usuario_id`, sem cópia do e-mail

- Status: aceito
- Data: 2026-11-09
- Issue: BOLA-05 (#13)

## Contexto

A tabela `saved_designs` guardava o vínculo com o autor duas vezes: `usuario_id` (inteiro, `NOT NULL`, com FK para `usuarios`) e `customer_email` (cópia do e-mail do autor no momento da criação). As duas colunas eram gravadas juntas, a partir do token, e nunca eram sincronizadas depois.

Todas as consultas de design (listar, atualizar e excluir) escopavam pelo `customer_email` do token, e não pelo `usuario_id`. O e-mail, porém, é mutável: a coluna `usuarios.email` não é imutável no modelo e pode ser alterada por quem administra a base. Com o e-mail como chave de autorização:

- o dono que trocasse de e-mail perdia o acesso aos próprios designs;
- uma conta nova cadastrada com o e-mail liberado passava a listar, alterar e excluir os designs do dono anterior.

O `usuario_id` não tem esses problemas: é o identificador interno da conta, não muda, e é o que o token carrega como `id`.

## Decisão

1. Toda consulta de design escopa por `usuario_id = <id do token>`: criação, atualização (`PUT /api/designs/:id`), listagem e exclusão.
2. A coluna `customer_email` e o índice `idx_designs_email` são **removidos** de `saved_designs` (migration `20261109012112_saved_designs_owner_by_usuario_id`).

### Por que remover em vez de manter como dado de exibição

- Nada lê a coluna: a API de designs não a devolve e o frontend não a exibe.
- O e-mail atual do dono já está disponível em `usuarios`, pela FK de `usuario_id`. Uma cópia nunca sincronizada só pode ficar desatualizada.
- Manter a coluna convida a reutilizá-la como escopo, que foi exatamente a falha corrigida aqui.

### Preenchimento de `usuario_id`

Não há registro a preencher: `usuario_id` é `NOT NULL` com FK para `usuarios` desde o primeiro schema (o legado e a migration `init`), e sempre foi gravado a partir do token. Todo design existente já tem dono.

Em caso de divergência entre as duas colunas, vale o `usuario_id`, porque ele identifica a conta que criou o design. Redirecionar o design para quem tem hoje o e-mail copiado entregaria o design justamente a quem herdou o e-mail.

## Consequências

- A troca de e-mail não altera mais a posse de nenhum design.
- Não há como reconstituir o e-mail histórico do autor de um design. Esse dado não tem uso no produto. Para voltar atrás no schema, a coluna pode ser recriada como opcional e preenchida com o e-mail atual a partir de `usuarios`.
- A migration remove uma coluna. Por isso as migrations precisam ser aplicadas junto com a versão da API que já não a usa, que é a ordem do `docker compose` (`migrate` antes de `api`).
- `pedidos.customer_email` não muda com esta decisão. No pedido, o e-mail é um registro do comprador no momento da compra. O escopo de pedidos por e-mail (`GET /api/orders`, lacuna L23 do levantamento) é tratado à parte.
