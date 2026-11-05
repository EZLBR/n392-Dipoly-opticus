# Base de segurança

## BOLA/IDOR

Toda operação que receba um identificador de objeto deve autorizar o acesso no servidor. A consulta deve ficar limitada ao escopo do usuário ou organização atual, ou ser seguida por uma política explícita de autorização.

Cobertura mínima de testes para cada recurso:

- proprietário consegue ler e alterar conforme a regra do domínio;
- outro usuário autenticado recebe negação sem vazamento de dados;
- usuário anônimo recebe a resposta apropriada;
- troca do identificador na URL, no corpo ou em relações aninhadas não amplia acesso;
- papéis privilegiados exercem somente as ações previstas.

### Respostas sem oráculo de enumeração (BOLA-02)

Um recurso inexistente e um recurso fora do escopo do usuário autenticado devem
retornar a mesma resposta **404**, sem informar que o objeto pertence a outra
pessoa ou fábrica. O status, o `Content-Type` (`application/problem+json`) e todos
os campos do Problem Details devem ser iguais nos dois casos, inclusive `type`,
`title`, `status`, `detail`, `error` e eventuais extensões. Somente `instance`,
`timestamp` e `traceId` variam por requisição para correlação, assim como o
cabeçalho `X-Request-Id`; esses valores não carregam dados do recurso.

O **403** é reservado à falta de papel RBAC e deve independer da existência do
objeto. Requisições sem autenticação válida recebem **401** antes do acesso ao
recurso. Tentativas negadas não devem alterar pedidos nem criar cobranças.

- `PUT /api/orders/:publicId/status`: fábricas recebem o mesmo 404 para pedido
  de outra fábrica e pedido inexistente; clientes recebem 403 em ambos os casos,
  pois não têm papel para mudar status. Staff pode atualizar qualquer pedido.
- `POST /api/payments/create-billing`: quem não é dono nem staff recebe
  `404` com `detail: "Pedido não encontrado."`, igual ao pedido inexistente.
  O dono continua criando cobranças, e a exceção de staff é explícita.

Os testes em `backend/tests/integration/orders-status-bola.test.ts` e
`backend/tests/integration/idor-pagamentos.test.ts` comparam o contrato completo,
excluindo apenas os três campos de correlação, e verificam os acessos permitidos
e a ausência de efeitos no banco nas tentativas negadas.

## Preço calculado no servidor

O valor de um pedido nunca vem do navegador. `POST /api/orders` e `POST /api/orders/checkout-cart` descartam qualquer `total` enviado e calculam o preço a partir das especificações do óculos, com a regra de `backend/src/domain/pricing.ts`, em centavos inteiros.

- os campos que mudam o preço (`isSunglasses`, `frameProfile`, `frameMaterial`, `lensMaterial`, `lensTreatments`) são validados contra o catálogo de opções; valor fora dele responde 400 com `invalidParams`;
- a especificação gravada no pedido é a mesma que foi precificada, então o que se cobra é o que vai para a fábrica;
- o gateway de pagamento recebe o preço unitário calculado no servidor;
- o frontend mantém uma cópia da regra em `frontend/src/utils/pricing.ts` só para a prévia, e um teste do backend compara as duas em todas as combinações de opções.

## Segredos e dados locais

- segredos reais nunca entram no repositório;
- somente `.env.example`, sem valores sensíveis, pode ser versionado;
- bancos SQLite e seus arquivos auxiliares são locais e ignorados;
- credenciais expostas devem ser revogadas e nunca reutilizadas;
- secret scanning e push protection devem ser habilitados no GitHub;
- a remoção do histórico não substitui a rotação das credenciais.

O frontend não possui usuários demo, senhas embutidas ou autenticação local de contingência. Se a API estiver indisponível, login e cadastro devem falhar de forma segura. Usuários privilegiados devem ser provisionados por um fluxo administrativo separado do cadastro público.
