# Base de segurança

## BOLA/IDOR

Toda operação que receba um identificador de objeto deve autorizar o acesso no servidor. A consulta deve ficar limitada ao escopo do usuário ou organização atual, ou ser seguida por uma política explícita de autorização.

Cobertura mínima de testes para cada recurso:

- proprietário consegue ler e alterar conforme a regra do domínio;
- outro usuário autenticado recebe negação sem vazamento de dados;
- usuário anônimo recebe a resposta apropriada;
- troca do identificador na URL, no corpo ou em relações aninhadas não amplia acesso;
- papéis privilegiados exercem somente as ações previstas.

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
