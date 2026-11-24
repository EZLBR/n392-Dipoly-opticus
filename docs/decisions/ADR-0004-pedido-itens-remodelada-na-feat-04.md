# ADR-0004: Manter `pedido_itens` e remodelá-la na FEAT-04

- Status: aceito
- Data: 2026-11-16
- Issue: DB-05 (#25). Implementação: FEAT-04 (#48)

## Contexto

A tabela `pedido_itens` nasceu na migration inicial (`20260901133803_init`), com chave primária, chaves estrangeiras para `pedidos` e `produtos` e dois índices. Nenhum código a lê ou grava: não há referência a ela em `backend/src` nem em `frontend/src`.

Hoje cada linha de `pedidos` é **um item comprado**:

- o nome do produto fica em `pedidos.product_name`, como texto;
- a especificação do Studio fica em `pedidos.custom_specs`;
- cada linha tem a sua fábrica (`factory_id`);
- o `POST /api/orders/checkout-cart` cria uma linha por item do carrinho, e todas compartilham o mesmo `billingId`.

Três fatos limitam o que dá para fazer com a tabela:

1. **O formato atual não serve para os pedidos reais.** `produto_id` é `NOT NULL`, com chave estrangeira para o catálogo (`produtos`). A maior parte dos pedidos vem do Studio, um óculos personalizado que não está no catálogo. Também não há onde guardar a especificação nem o nome do produto no momento da compra.
2. **Cada item do carrinho pode ser de uma fábrica diferente.** A fábrica só altera o status dos próprios pedidos (BOLA-01, FEAT-03). Um pedido que misturasse fábricas quebraria a posse e o status por fábrica.
3. **A FEAT-04 (#48), que agrupa os itens de um pedido, já está no backlog**, com o mesmo responsável desta issue. O CART-01 (#115), do Enzo, persiste o carrinho por conta e precisa combinar com ela a forma do item.

## Alternativas

| | Alternativa | Avaliação |
| --- | --- | --- |
| A | Remover a tabela agora, com uma migration de `DROP` | Tira do schema uma peça morta e enganosa. Mas a FEAT-04 recriaria a tabela depois, com outro formato: são duas migrations para chegar ao mesmo lugar. |
| B | Manter como está e começar a usar | **Rejeitada.** Não representa um item do Studio, porque o produto do catálogo é obrigatório. |
| C | **Manter e remodelar na FEAT-04** | **Escolhida.** A tabela está vazia, então remodelar custa o mesmo que recriar, e a decisão fica visível no schema até lá. |
| D | Manter sem plano | **Rejeitada.** É exatamente a situação que a DB-05 existe para encerrar. |

## Decisão

1. **`pedido_itens` fica**, e a FEAT-04 a remodela numa migration própria:
   - `produto_id` passa a ser opcional, só para item do catálogo; item do Studio não tem produto;
   - colunas novas: `product_name` (o nome no momento da compra) e `custom_specs` (`JSONB`, a especificação do Studio);
   - `quantidade` com `CHECK (quantidade > 0)`;
   - `preco_unitario DECIMAL(10,2)` com `CHECK (preco_unitario >= 0)`, gravado na compra a partir do cálculo do servidor (SEC-05), nunca do valor enviado pelo cliente;
   - `publicId`, se o item for exposto na API (ADR-0003).
2. **O pedido passa a ser a unidade de fabricação:** um pedido por fábrica em cada checkout, com N itens. Status, fábrica dona e versão (FEAT-03 e CONC-02) continuam no pedido; o item não tem status próprio.
3. **O total do pedido continua em `pedidos.total`**, como a soma dos itens, calculada no servidor na mesma transação em que os itens são gravados.
4. **A cobrança continua cobrindo todos os pedidos do checkout**, com o `billingId` compartilhado, como hoje.
5. **Até a FEAT-04, nenhum código lê nem grava `pedido_itens`.** O model `PedidoItem` do `schema.prisma` recebe um comentário dizendo isso.

## Consequências

- **Nenhuma migration nesta issue.** A tabela já existe e está vazia, porque nada grava nela. Antes da FEAT-04, é preciso conferir no banco publicado (DEVOPS-03) que ela continua vazia.
- **A FEAT-04 inclui migração de dados**, como tarefa própria com reconciliação (padrão §7). Cada pedido existente vira um pedido com um item:
  - `product_name` e `custom_specs` vêm do próprio pedido;
  - `quantidade` vem de `custom_specs.quantity`;
  - `preco_unitario` é `total / quantidade` **só quando a divisão em centavos for exata**. Caso contrário, o item fica com quantidade 1 e preço igual ao total, e o pedido vai para a lista de conciliação.
- **Contrato com o CART-01 (#115).** O carrinho persistido guarda os itens antes da compra; no checkout, eles viram pedidos e `pedido_itens`. Os dois devem usar a mesma forma de item (`productName`, `factoryPublicId`, `customSpecs`, `quantity`), com o preço sempre calculado no servidor.
- **Telas.** Os painéis e o "Meus pedidos" (FEAT-02) passam a mostrar os itens agrupados. O histórico de status (trigger da FEAT-02) continua por pedido.
- **Se a FEAT-04 sair do roadmap**, esta decisão deve ser revista e a tabela removida (alternativa A).
