# STUDIO-03 (#84) — imagens privadas na armação

Status: aprovada pelo Enzo em 05/11/2026, incluindo login, seis camadas e cota de 20 imagens/100 MiB. Execução direta e decisões de detalhe delegadas; consultar apenas mudanças de escopo, segurança ou custo. Upload ainda não implementado nesta aprovação.

Restrição de 05/11: manter #13/#14 com João Pedro e avançar no que não depende delas. O PR #99 já foi integrado; branch atualizada com origin/dev (`f8a4fe8`) por merge local `5879333`. A referência ao PR aberto abaixo registra o contexto de 24/10, não o estado atual.

## Intenção

Permitir que o cliente coloque uma imagem própria na frente ou nas hastes, ajuste recorte e transformação, salve o design e o recupere após login em outro dispositivo. Reutilizar o modelo de camadas e a projeção restrita do STUDIO-02, sem transformar a prévia em garantia de fabricação.

## Escolhas já aprovadas pelo Enzo

- Volume privado e persistente no backend.
- PNG, JPEG e WebP; limite proposto aceito de 5 MB e 4096 × 4096 pixels.
- Arquivos acessíveis apenas pelo dono; lentes não editáveis.
- Continuidade do Studio, não um editor ou site separado.

## Abordagens consideradas

1. **Volume privado do backend — escolhido.** Reaproveita a infraestrutura Docker existente e dispensa provisionar um serviço externo. Exige volume separado do código, backup dos arquivos junto com o banco e uma única instância da API ou armazenamento compartilhado entre instâncias.
2. **Armazenamento externo compatível com S3.** Separa arquivos da API e facilita escalar as instâncias, mas exige configuração, credenciais e política de acesso próprias; não foi a opção escolhida para este bloco.
3. **Base64 dentro do JSON/localStorage — descartado tecnicamente.** A API limita JSON a 1 MB, o Studio precisa recuperar imagens em outro dispositivo e caminhos/URLs transitórias não garantem persistência privada.

## Estado atual e base de trabalho

- Base funcional: commit `8b2bfd5` do PR #99, ainda aberto para `dev`. Nova branch `feat/studio-03-image-upload` preserva a branch do PR anterior; nenhum merge será feito por esta tarefa sem autorização.
- `artwork.ts` e o DTO do backend hoje aceitam apenas texto em `artwork.version: 1`, até seis camadas.
- `artwork-renderer.ts` projeta sobre malhas `rim`/`temple`, nunca sobre lentes; o viewer e as miniaturas compartilham esse renderizador.
- `CreatorStudioContext` persiste rascunho no navegador por dono; `AuthContext` já protege trocas de conta e distingue salvamento remoto de cópia local.
- A API não tem upload privado. O Compose persiste somente o banco; a imagem roda como usuário `node` e omite dependências opcionais do runtime.
- #13 e #14, de João Pedro, seguem abertas: escopo de designs por `usuario_id` e separação segura entre criação/atualização. Integração final da #84 depende desses contratos. Não assumir que consultá-las equivale a implementá-las ou fechá-las.

## Propostas do executor para esta primeira versão

Estas decisões completam lacunas da issue e ficam sujeitas à aprovação deste documento; não são tratadas como decisões já tomadas pelo Enzo.

- Login é necessário para adicionar imagens. Anônimos continuam usando materiais, texto e seus rascunhos atuais; o upload explica a necessidade de entrar na conta sem apagar a criação.
- Interpretar 5 MB como 5 × 1024 × 1024 bytes, aplicar também ao arquivo canônico armazenado. Dimensões mínimas 1 × 1 e máximas 4096 × 4096 após orientação.
- Até seis camadas no total, misturando textos e imagens. Não alterar os limites atuais de texto, posição, tamanho ou rotação.
- Cota inicial de 20 assets e 100 MiB por conta, incluindo imagens ainda não vinculadas a designs. Informar limite atingido e permitir remover uploads não usados, sem apagar silenciosamente rascunhos.
- Arquivos validados são duráveis até exclusão explícita ou liberação pela troca/exclusão de seu último design. Não expirar por tempo imagens válidas de rascunhos sem avisar o cliente. Temporários de requisições incompletas não são assets válidos e devem ser limpos.
- Reutilizar os controles existentes do painel de arte e acrescentar upload/substituição/recorte; sem redesenhar o Studio inteiro e sem arrastar diretamente sobre o canvas 3D neste bloco.

## Fluxo funcional e recuperação

1. Cliente autenticado escolhe arquivo. O navegador valida tipo/tamanho/dimensões para feedback, mas o backend é a autoridade e valida novamente.
2. Mostrar a imagem candidata em estado transitório, separado da configuração salva. Enviar um arquivo por requisição multipart; não ampliar o limite JSON global.
3. Só depois do upload validado e da confirmação de que dono/token ainda são os mesmos, adicionar/substituir a camada na configuração e persistir seu `assetId`. Falha ou cancelamento preserva camada anterior, transformação, rascunho e último design salvo.
4. O cliente escolhe região, recorta e ajusta posição, escala e rotação dentro dos limites existentes. Recorte é não destrutivo: preserva o arquivo canônico e salva o retângulo normalizado.
5. Salvar o design transmite referências e parâmetros, não bytes/URLs. O servidor valida todas as referências contra o usuário autenticado e sincroniza o conjunto de referências de forma transacional com o design.
6. Novo dispositivo lê configuração e busca os bytes pelos endpoints autenticados. Falha de leitura mantém os parâmetros e mostra imagem indisponível/tentar novamente; não remove a camada nem substitui silenciosamente o arquivo por outro.
7. Ao trocar de conta/logout, cancelar uploads/leitura, descartar respostas antigas e liberar objetos de imagem/URLs/texturas. Dados A não entram no cache, preview ou salvamento de B.
8. Substituir camada não apaga seu asset anterior antes de confirmar a nova operação e preservar as referências de outros designs. Excluir imagem usada por outro design não pode quebrar esse design.

## Formato e compatibilidade

- Manter os demais campos de `EyewearConfig` e sua versão superior atual.
- Introduzir `artwork.version: 2`, com união discriminada `kind: "text" | "image"`. Texto mantém os campos atuais; imagens usam `id`, `assetId`, `zone`, `x`, `y`, `size`, `rotation` e `crop`.
- `assetId` é UUID opaco criado pelo servidor. Nunca aceitar caminho de disco, URL externa, `data:` ou `blob:` como referência persistida.
- `crop = { x, y, width, height }` em coordenadas da imagem orientada, de 0 a 1; largura/altura positivas, contido na imagem e pelo menos um pixel após conversão. Padrão: imagem inteira.
- Áreas permitidas: `front-left`, `front-right`, `temple-left`, `temple-right`. Posição de −1 a 1, tamanho de 0,25 a 1 e rotação de −30° a 30°, como nas camadas atuais.
- Leitura aceita designs sem arte e `artwork.version: 1`; texto legado é convertido sem alterar aparência. V2 vazio continua sendo V2 para permitir exclusão intencional de todas as camadas.
- Clientes antigos não podem sobrescrever silenciosamente arte V2: update incompatível retorna conflito orientando atualizar o Studio. Atualizações legadas que não trazem configuração completa devem preservar o documento anterior.
- Checkout continua bloqueado para qualquer arte, inclusive imagens. Publicação/galeria pública não torna bytes privados públicos.

## Contrato de assets e autorização

- `POST /api/studio/assets`: multipart com um campo `file`; autenticar antes de receber/processar arquivo; retorna 201 com `{ asset: { id, mediaType, width, height, bytes } }`.
- `GET /api/studio/assets`: lista somente metadados do dono; permite recuperar e remover uploads não usados quando atingir a cota, sem expor caminhos internos.
- `GET /api/studio/assets/:id/content`: exige token e escopo por `usuario_id`; devolve bytes canônicos com tipo correto, `nosniff` e cache privado sem armazenamento compartilhado. Asset alheio e inexistente retornam a mesma resposta 404.
- `DELETE /api/studio/assets/:id`: só para dono; 204 quando asset sem referência persistida é descartado; 409 se algum design ainda depende dele; alheio/inexistente é 404 indistinguível.
- Reutilizar Problem Details e interceptores 401/403 existentes. 413 para bytes excedidos, 415 para formato não aceito, 400 para conteúdo/dimensões inválidos, 409 para conflito/cota, 503 para indisponibilidade do armazenamento. Sem nomes privados/bytes no log.
- Novas referências em salvamento de design precisam corresponder a assets prontos do mesmo `usuario_id`; rejeição não modifica configuração nem referências anteriores. Owner estrangeiro não pode ser descoberto pelo erro.
- Cota/contagem e vinculação/exclusão usam locks/transações ou restrições equivalentes; duas requisições concorrentes não ultrapassam a cota nem apagam um asset recém-vinculado.

## Validação, armazenamento e ciclo de vida

- Nome original, extensão e MIME declarados não são prova de formato. Verificar conteúdo e realizar decodificação limitada; rejeitar SVG/GIF/HEIC, arquivos inválidos, truncados, animações e dimensões/pixels excedidos.
- Normalizar orientação e reencodar em formato raster canônico permitido, preservar transparência e remover metadados EXIF/localização. O decoder e o formato exato ficam a cargo do implementador, dentro desses limites.
- Streaming/temporários limitados a 5 MiB de entrada, um arquivo e campos permitidos; limites de pixels/memória antes de alocação excessiva, tempo de processamento limitado e concorrência de decodificação controlada. Rate limit autenticado específico, além do limite global.
- Armazenar fora de `public`/diretório estático, com nome gerado pelo servidor, resolução de caminho confinada ao volume e sem usar nome original na chave física.
- Metadados no PostgreSQL: UUID, `usuario_id`, chave física privada, tipo canônico, dimensões, bytes, estado e timestamps. Manter associação explícita design↔asset para validar uso e impedir exclusão de arquivos referenciados.
- Arquivo só fica legível quando pronto. Se disco ou transação falhar, não publicar asset incompleto; compensar arquivo temporário/definitivo sem registro. Não prometer atomicidade inexistente entre banco e filesystem: registrar limpeza pendente e tornar recuperação idempotente.
- Remoção final usa estado tombstone/limpeza pendente antes do unlink, com retry seguro. Arquivo ainda referenciado nunca é removido. Assets sem design mas pertencentes a rascunho/upload do dono não são tratados como lixo só por não estarem salvos em um design.
- Na substituição/exclusão de camada salva, liberar associação apenas no commit aceito. Asset que perdeu sua última associação pode ser removido quando não for necessário à operação atual; preservar asset compartilhado por outro design e não apagar uploads independentes não descartados.
- Criar volume nomeado específico e variável de caminho privado, permissões compatíveis com usuário `node`, .gitignore/.dockerignore e documentação de backup/restauração combinando volume+banco. Reiniciar/recriar container não perde assets.
- Escolha de decoder/dependências deve ser validada em Node 22 no Windows e na imagem Alpine. O `--omit=optional` atual exige atenção se o decoder depender de binários opcionais; não recolocar CLI do Prisma nem segredos na imagem runtime como efeito colateral.

## Renderização e recursos

- Generalizar a projeção existente, preservando alvos rim/temple e ajuste do footprint à superfície; imagem não atravessa lentes, apoio nasal, ponte ou dobradiças bloqueadas.
- Criar textura a partir do raster autenticado e do recorte. Garantir ordem de camadas coerente entre Studio e miniaturas e preservar texto existente.
- Carregamento assíncrono tem geração/token de cancelamento: uma resposta de geometria, camada ou conta antiga não pode repor textura descartada.
- Buscar conteúdo com header Authorization via cliente HTTP; `<img src>` direto no endpoint privado não substitui autenticação. URLs de objeto são transitórias, revogadas ao substituir/desmontar/trocar conta; não entram no JSON/localStorage.
- Dispor textura, geometria, materiais e ImageBitmap/URLs ao atualizar/desmontar. Erro de imagem não derruba WebGL nem descarta o restante do design.

## Aceite e verificação

- Unitários: normalização V1/V2, limites de camadas/recorte/transformação, serialização sem URLs, conteúdo inválido e seleção de regiões bloqueadas.
- Backend integração: usuário A/B, 401 e 404 indistinguível, MIME/extensão falsos, SVG, truncados, dimensões/bytes excedidos, quota concorrente, rollback de upload/save e arquivo em uso, substituição/exclusão com referências, reabertura em nova sessão.
- Frontend integração: upload/cancelamento/falha mantendo camada anterior, troca de conta durante upload/leitura, crop/scale/rotate persistidos, erro de asset recuperável, designs legados e bloqueio de checkout.
- Projeção/recursos: todas as silhuetas e regiões, inclusive armação fina, hastes dobradas, aspecto muito largo/alto, troca de geometria enquanto carrega e liberação de recursos.
- Verificação visual em desktop/mobile: texto+imagem, PNG transparente, recorte, recuperação após login e miniaturas; alternativa por controles de teclado, sem exigir gesto sobre o 3D.
- Executar testes completos frontend/backend em banco `_test` isolado, typecheck/build de ambos, validação Prisma/migrations e testes das imagens Docker/Compose pertinentes ao volume/decoder. Nunca usar banco de preview/usuário para teste destrutivo.
- Done somente após critérios verificados e integração à `dev`; #99 e contratos #13/#14 precisam estar resolvidos. Não publicar/mesclar nem alterar atribuições de outras issues sem autorização correspondente.

## Não objetivos e antimetas

Não incluir lentes, receita médica, agenda, desenho livre, catálogo de texturas, editor gráfico completo, acesso público de assets, serviços externos ou garantia automática de fabricação. Não enfraquecer autorização para contornar as dependências abertas. Não considerar upload local transitório como entrega de persistência em outro dispositivo.

## Próximo passo após aprovação

Escrever o plano de implementação em tarefas testáveis de backend/armazenamento, modelo/renderização e integração do editor, preservando a execução direta já preferida pelo Enzo e uma revisão independente final. Este documento não autoriza implementar as issues de João Pedro no lugar dele.
