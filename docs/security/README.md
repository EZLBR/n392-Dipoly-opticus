# Base de segurança

## BOLA/IDOR

Toda operação que receba um identificador de objeto deve autorizar o acesso no servidor. A consulta deve ficar limitada ao escopo do usuário ou organização atual, ou ser seguida por uma política explícita de autorização.

Cobertura mínima de testes para cada recurso:

- proprietário consegue ler e alterar conforme a regra do domínio;
- outro usuário autenticado recebe negação sem vazamento de dados;
- usuário anônimo recebe a resposta apropriada;
- troca do identificador na URL, no corpo ou em relações aninhadas não amplia acesso;
- papéis privilegiados exercem somente as ações previstas.

## Segredos e dados locais

- segredos reais nunca entram no repositório;
- somente `.env.example`, sem valores sensíveis, pode ser versionado;
- bancos SQLite e seus arquivos auxiliares são locais e ignorados;
- credenciais expostas devem ser revogadas e nunca reutilizadas;
- secret scanning e push protection devem ser habilitados no GitHub;
- a remoção do histórico não substitui a rotação das credenciais.

O frontend não possui usuários demo, senhas embutidas ou autenticação local de contingência. Se a API estiver indisponível, login e cadastro devem falhar de forma segura. Usuários privilegiados devem ser provisionados por um fluxo administrativo separado do cadastro público.
