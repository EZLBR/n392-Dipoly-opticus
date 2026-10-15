# STUDIO-02 — texto na armação

Implementa o escopo autorizado nas issues #82, #4 e #83. O cliente cria camadas de texto na frente e nas hastes, acompanha a prévia 3D e salva o design na conta. Lentes não recebem arte. Imagens, desenho livre e texturas ficam para #84–#86.

## Contrato e persistência

`EyewearConfig` passa a conter `version: 1` e `artwork: { version: 1, layers: TextLayer[] }`. Cada camada contém id, text, zone, font, color, x, y, size e rotation. Há no máximo 6 camadas, 24 caracteres por texto, fontes sans/serif/mono, cor hexadecimal de seis dígitos, coordenadas normalizadas de -1 a 1, tamanho entre 0.25 e 1 e rotação de -30 a 30 graus. As zonas são front-left, front-right, temple-left e temple-right.

Uma migration aditiva cria `saved_designs.studio_config JSONB`, nullable para registros anteriores. A API valida a configuração e preserva o documento completo ao criar/atualizar. A listagem retorna `config`; quando presente ele é autoritativo, inclusive em outro dispositivo. Registros legados continuam usando seus campos atuais. O contrato de resposta existente na dev é mantido.

## Superfícies e experiência

O editor ocupa uma etapa Arte entre Componentes e Revisão. Cada camada pode ser selecionada, editada e removida. Os limites normalizados são convertidos em posições na geometria atual, com margens junto às bordas. DecalGeometry projeta a textura de texto somente nos meshes de aro ou haste. Nenhuma projeção usa lentes. As camadas acompanham a dobra das hastes. Texturas, materiais e geometrias são liberados ao atualizar ou desmontar.

Os controles de regiões são acessíveis por teclado e funcionam em telas pequenas. As regiões ainda não aprovadas para fabricação são identificadas; o usuário pode salvar a criação. A sacola fica indisponível para configurações com arte, e a API também rejeita pedidos com camadas de arte.

## Identidade e checkout

O cache do Studio possui marcador de dono. Trocas de conta, logout e expiração limpam designs, seleção e rascunhos privados; um workspace explicitamente anônimo pode ser adotado no login. Respostas de outra sessão não podem repovoar o cache. O Studio remonta seu estado ao mudar o dono.

A página HTML do checkout simulado exige routerGuard e consulta por usuario_id. O cliente abre o HTML por fetch autenticado e iframe isolado, sem token em URL. Cobranças de outra conta recebem 404. A confirmação de pagamento (#2) permanece sob responsabilidade de sua issue.

## Validação

Testes reproduzem A → logout → B, rascunho anônimo e resposta tardia. Testes de API cobrem checkout anônimo, dono, não-dono e dados pessoais; validação e round trip do documento entre clientes diferentes; payload inválido; bloqueio de compra com arte. Testes de geometria conferem zona sem lente e descarte dos recursos. Testes de interface e revisão no navegador cobrem controles, edição imediata e tela pequena. Executar as suítes, typecheck e build de ambos os pacotes.
