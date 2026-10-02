// ============================================================
//   Vulnerabilidades conhecidas como testes executáveis
//
//   Um teste de regressão de uma falha ainda não corrigida fica
//   vermelho, e vermelho não entra no dev. Por isso o cenário é
//   registrado aqui com DUAS descrições:
//
//     seguro     — o comportamento correto, que a correção deve
//                  produzir (é o teste de regressão, já escrito)
//     vulneravel — a assinatura exata da falha hoje
//
//   Três resultados possíveis:
//
//     comportamento bate com `vulneravel`  → passa (dívida registrada)
//     comportamento já atende `seguro`     → FALHA, avisando que a
//                                            falha foi corrigida e o
//                                            teste deve ser promovido
//     qualquer outra coisa                 → FALHA alto
//
//   Por que não `it.fails` do Vitest: ele passa diante de QUALQUER
//   erro — inclusive fixture quebrada ou `beforeEach` que lançou —,
//   então uma suíte com o setup quebrado continuaria verde fingindo
//   que a vulnerabilidade existe. Aqui, preparação e observação
//   rodam fora de qualquer try/catch: se quebrarem, o teste quebra.
//
//   COMO PROMOVER quando a issue for corrigida:
//     troque `vulnerabilidadeConhecida({ ... })` por um `it()` normal
//     cujo corpo é o `observar` seguido das asserções de `seguro`.
// ============================================================

export interface VulnerabilidadeConhecida<T> {
  /** Issue que corrige a falha, ex.: "SEC-01 #2". Aparece na mensagem de promoção. */
  issue: string;
  /** Monta o estado e executa o ataque. Erros aqui derrubam o teste. */
  observar: () => Promise<T>;
  /** Asserções do comportamento correto — o alvo da correção. */
  seguro: (resultado: T) => void | Promise<void>;
  /** Asserções da falha como ela se manifesta hoje. Precisam ser específicas. */
  vulneravel: (resultado: T) => void | Promise<void>;
}

export async function vulnerabilidadeConhecida<T>(caso: VulnerabilidadeConhecida<T>): Promise<void> {
  const resultado = await caso.observar();

  let seguroJaPassa = true;
  try {
    await caso.seguro(resultado);
  } catch {
    seguroJaPassa = false;
  }

  if (seguroJaPassa) {
    throw new Error(
      `[${caso.issue}] O comportamento seguro já passa — a vulnerabilidade parece corrigida.\n` +
        "Promova este caso para um it() normal com as asserções de `seguro`, " +
        "para que ele passe a proteger a correção contra regressão."
    );
  }

  // Se o comportamento não é o seguro, ele tem de ser exatamente a falha
  // conhecida. Qualquer outra coisa é mudança não explicada e deve aparecer.
  await caso.vulneravel(resultado);
}
