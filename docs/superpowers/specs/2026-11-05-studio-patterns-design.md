# STUDIO-05 — desenho de implementação

Objetivo: catálogo visual de listras, pontos e xadrez, selecionável na armação com escala, rotação e cor secundária, usando os mesmos materiais e previews existentes.

Abordagens: (1) texturas procedurais em DataTexture, escolhida pelo executor porque é determinística, pequena e não exige assets externos; (2) bitmaps empacotados, dispensados porque não adicionam qualidade necessária a esse catálogo geométrico; (3) uploads próprios, excluídos pela #86 e tratados na #84.

Campo surfacePattern opcional/versionado, normalizado no cliente e validado no servidor. Nenhum/ausência preserva exatamente o material anterior; os padrões são aplicados à armação, nunca à lente. Cores vêm de config.color mais ink secundário. Escala 1–6 e orientação −180° a 180°. Interface usa controles existentes, sem redesenho global.

Não há promessa de fabricação: este catálogo é apenas visual até validação da fábrica. Salvamento/recuperação preservam parâmetros; reedição legada não pode apagar o campo. Sem receitas, agenda, uploads ou alteração de autorização. A escolha de detalhes foi delegada explicitamente pelo Enzo em 05/11/2026, com execução direta.
