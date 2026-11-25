# ADR-0005: Carrinho persistido por conta

- Status: aceito
- Data: 2026-11-25
- Issue: CART-01 (#115)

## Contexto

Até aqui o carrinho vivia só no navegador, na chave global `opticus_cart` do `localStorage`:

- **Sem dono:** a chave não sabia de quem era. Na sequência conta A → logout → conta B no mesmo navegador, B via e podia comprar os itens de A.
- **Preso ao navegador:** entrar em outro navegador ou dispositivo mostrava um carrinho vazio.
- **Limpeza pela URL:** o carrinho era esvaziado quando a página abria com `?payment=success`, sem nenhuma confirmação do servidor. Uma cobrança abandonada ou recusada podia esvaziar o carrinho, e qualquer link com esse parâmetro também.
- **Checkout com lista do navegador:** o checkout recebia a lista que o navegador mandasse, sem relação com um carrinho guardado.

## Decisão

1. **O carrinho fica no backend**, na tabela `carrinho_itens`, ligada ao usuário (`usuario_id`, com `ON DELETE CASCADE`). O dono vem sempre do token, e um item de outra conta responde o mesmo 404 que um item inexistente.
2. **Uma linha por configuração.** A identidade da linha é um SHA-256 do item validado (produto, fábrica e especificações, sem a quantidade), calculado no servidor. Adicionar a mesma configuração soma quantidade na mesma linha, num `INSERT ... ON CONFLICT`, e outra configuração do mesmo modelo vira outra linha.
3. **A entrada é validada como o checkout:** o mesmo `cartItemSchema`, com as opções do catálogo e a trava de arte e estampa. A fábrica informada precisa existir. São no máximo 20 linhas e 100 unidades por linha.
4. **O preço é do servidor.** Cada leitura recalcula o preço unitário e o total (SEC-05), e o cliente nunca envia preço.
5. **O checkout (`POST /api/cart/checkout`) usa o carrinho gravado.** O corpo traz só o carrinho que o cliente está vendo (`publicId` e quantidade de cada item). Se ele não for exatamente o carrinho atual, porque outra aba ou dispositivo o mudou, a resposta é 409 e nenhum pedido é criado.
6. **Os itens saem do carrinho só com o pagamento confirmado.** Na transação que cria os pedidos, cada linha guarda o pedido que gerou (`pedido_id`), desde que ainda esteja na versão lida. Quando o pagamento desse pedido é confirmado, pelo webhook ou pelo simulador, a linha é apagada na mesma transação (`aprovarPagamentos`). Uma linha alterada depois do checkout perde o vínculo e fica. Falha, recusa ou abandono do pagamento não mexem no carrinho.
7. **O `POST /api/orders/checkout-cart` continua** com o contrato atual, para não quebrar quem o usa. O frontend passa a usar `/api/cart/checkout`.

## Carrinho legado (`opticus_cart`)

Os dados antigos não têm dono comprovado: qualquer conta que tenha usado o navegador pode tê-los criado. Por isso:

- eles **nunca** são enviados ao servidor nem associados a quem fizer login;
- o frontend **apaga** a chave `opticus_cart` na primeira carga depois do deploy.

Isso faz o cliente perder um carrinho antigo que só existia naquele navegador. Esse custo é aceito: a alternativa entregaria a uma conta itens que podem ser de outra pessoa.

## Consequências

- **Visitantes não têm carrinho.** O carrinho já era uma rota privada (FE-08). A fábrica também não tem: o carrinho é de cliente e staff, como a rota `/cart`.
- **Frontend sem mudança otimista:** a tela só mostra o que o servidor confirmou. Cada alteração devolve o carrinho inteiro.
- **Troca de sessão:** o carrinho anterior some da tela na hora. Uma resposta atrasada da sessão anterior é descartada.
- **Limite conhecido:** se o mesmo carrinho for cobrado duas vezes e o cliente pagar a cobrança antiga, as linhas apontam para os pedidos da cobrança nova e continuam no carrinho. É o mesmo caso do link antigo pagável, que fica para um item próprio.
