// ============================================================
//   GATEWAY DE PAGAMENTO — criação de cobrança no AbacatePay
//
//   O resultado é classificado em três casos, porque cada um exige
//   uma reação diferente de quem chamou (revisão do #93):
//
//   criada    o gateway confirmou a cobrança. Uma falha depois disso
//             é de gravação nossa: o pedido é preservado e conciliado.
//   recusada  o gateway respondeu que não criou a cobrança. É seguro
//             desfazer o que a tentativa criou.
//   incerta   não houve resposta conclusiva (timeout, rede, resposta
//             ilegível). A cobrança pode existir: nada é desfeito.
//
//   O módulo não lê configuração: o token e o pedido vêm de quem
//   chama, para a classificação ser testável sem banco nem ambiente.
// ============================================================

export const URL_DE_COBRANCA = "https://api.abacatepay.com/v2/billing";

/** Tempo máximo de espera pelo gateway. Depois disso, o resultado é incerto. */
export const TEMPO_LIMITE_DO_GATEWAY_MS = 10_000;

export interface PedidoDeCobranca {
  products: Array<{ externalId: string; name: string; quantity: number; price: number }>;
  returnUrl: string;
  completionUrl: string;
  customer: { name?: string; email?: string; taxId: string };
}

export type ResultadoDaCobranca =
  | { status: "criada"; billingId: string; url: string }
  | { status: "recusada"; motivo: string }
  | { status: "incerta"; motivo: string };

const LIMITE_DO_MOTIVO = 300;
const resumir = (texto: string) => texto.split("\n")[0].slice(0, LIMITE_DO_MOTIVO);
const descrever = (erro: unknown) => resumir(erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro));
const ehErroDoCliente = (status: number) => status >= 400 && status < 500;

export async function solicitarCobranca(token: string, pedido: PedidoDeCobranca): Promise<ResultadoDaCobranca> {
  let resposta: Response;
  try {
    resposta = await fetch(URL_DE_COBRANCA, {
      method: "POST",
      signal: AbortSignal.timeout(TEMPO_LIMITE_DO_GATEWAY_MS),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ frequency: "ONE_TIME", methods: ["PIX"], ...pedido }),
    });
  } catch (erro) {
    // Timeout ou rede: a requisição pode ter chegado e a cobrança existir.
    return { status: "incerta", motivo: descrever(erro) };
  }

  let corpo: { success?: unknown; error?: unknown; data?: { id?: unknown; url?: unknown } } | null;
  try {
    corpo = await resposta.json();
  } catch {
    // Um 4xx já é uma recusa. Um 2xx ou 5xx sem corpo legível não diz o que aconteceu.
    return ehErroDoCliente(resposta.status)
      ? { status: "recusada", motivo: `HTTP ${resposta.status}` }
      : { status: "incerta", motivo: `HTTP ${resposta.status} com corpo ilegível` };
  }

  if (resposta.ok && corpo?.success === true) {
    const billingId = corpo.data?.id;
    const url = corpo.data?.url;
    if (typeof billingId === "string" && billingId && typeof url === "string" && url) {
      return { status: "criada", billingId, url };
    }
    // Declarou sucesso sem identificar a cobrança: não dá para seguir nem para desfazer.
    return { status: "incerta", motivo: "sucesso sem id ou url da cobrança" };
  }

  // O gateway respondeu e declarou a falha: a cobrança não foi criada.
  if (corpo?.success === false || ehErroDoCliente(resposta.status)) {
    const motivo = typeof corpo?.error === "string" && corpo.error ? corpo.error : `HTTP ${resposta.status}`;
    return { status: "recusada", motivo: resumir(motivo) };
  }

  return { status: "incerta", motivo: `HTTP ${resposta.status} sem confirmação` };
}
