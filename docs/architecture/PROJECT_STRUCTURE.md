# Estrutura do projeto

## Diretórios ativos

| Diretório | Responsabilidade |
| --- | --- |
| `frontend/` | Aplicação React, experiência 3D, AR e comunicação HTTP. |
| `backend/` | API Express, autenticação, autorização e persistência PostgreSQL. |
| `docs/` | Decisões técnicas, convenções de API e requisitos de segurança. |

Frontend e backend possuem `package.json`, `package-lock.json` e `tsconfig.json` próprios. Não existe dependência de runtime instalada na raiz.

## Regras de dependência

- o frontend acessa o backend somente por HTTP;
- o backend não importa arquivos do frontend;
- segredos permanecem apenas no ambiente do backend;
- tipos compartilhados só devem virar um pacote próprio quando houver contratos estáveis e consumidores reais;
- decisões de autorização sempre são aplicadas no backend.
