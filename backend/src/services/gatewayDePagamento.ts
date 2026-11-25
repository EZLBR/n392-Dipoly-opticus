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
//
//   API v2: o checkout só aceita produtos já cadastrados no AbacatePay
//   (items[].id = externalId). Por isso cada pedido vira um produto
//   antes de criar o checkout. O antigo
//   POST /v2/billing não existe (respondia "Not found"); o corpo com
//   frequency/products/customer era o da v1, que a chave v2 recusa.
//   https://docs.abacatepay.com/pages/products/create
//   https://docs.abacatepay.com/pages/payment/create
//
//   O AbacatePay guarda o preço do primeiro cadastro de um externalId e
//   não deixa alterá-lo. Por isso o externalId do produto leva o preço
//   (idDoProduto): o carrinho cadastra o preço unitário e o "pagar pedido"
//   cadastra o total, e os dois nunca reaproveitam o produto um do outro
//   (revisão do #146). Mesmo assim o valor do checkout é conferido com o
//   total calculado aqui: se divergir, o link não vai para o cliente.
// ============================================================

export const URL_DE_PRODUTO = "https://api.abacatepay.com/v2/products/create";
export const URL_DE_COBRANCA = "https://api.abacatepay.com/v2/checkouts/create";

/** Tempo máximo de espera pelo gateway. Depois disso, o resultado é incerto. */
export const TEMPO_LIMITE_DO_GATEWAY_MS = 10_000;

/** Produto no AbacatePay: o mesmo pedido com outro preço é outro produto. */
export const idDoProduto = (produto: { externalId: string; price: number }) =>
  `${produto.externalId}-${produto.price}`;

export interface PedidoDeCobranca {
  /** externalId é o publicId do pedido; price é o preço unitário em centavos. */
  products: Array<{ externalId: string; name: string; quantity: number; price: number }>;
  returnUrl: string;
  /** A v2 não recebe o pagador: o próprio checkout pede os dados dele. */
  completionUrl: string;
}

export type ResultadoDaCobranca =
  | { status: "criada"; billingId: string; url: string }
  | { status: "recusada"; motivo: string }
  | { status: "incerta"; motivo: string };

const LIMITE_DO_MOTIVO = 300;
const resumir = (texto: string) => texto.split("\n")[0].slice(0, LIMITE_DO_MOTIVO);
const descrever = (erro: unknown) => resumir(erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro));
const ehErroDoCliente = (status: number) => status >= 400 && status < 500 && status !== 408 && status !== 429;

const postar = (token: string, url: string, corpo: unknown) =>
  fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(TEMPO_LIMITE_DO_GATEWAY_MS),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });

/**
 * Cadastra o produto do pedido. Devolve o motivo da falha, ou null se ele
 * existe (criado agora ou numa tentativa anterior do mesmo pedido).
 * Nenhuma falha aqui cria cobrança: quem chama pode recusar com segurança.
 */
async function cadastrarProduto(token: string, produto: PedidoDeCobranca["products"][number]): Promise<string | null> {
  let resposta: Response;
  try {
    resposta = await postar(token, URL_DE_PRODUTO, {
      externalId: idDoProduto(produto),
      name: produto.name,
      price: produto.price,
      currency: "BRL",
    });
  } catch (erro) {
    return `produto: ${descrever(erro)}`;
  }
  let corpo: { success?: unknown; error?: unknown } | null = null;
  try {
    corpo = await resposta.json();
  } catch {
    // corpo ilegível: decide pelo status abaixo
  }
  if (resposta.ok && corpo?.success === true) return null;
  const erro = typeof corpo?.error === "string" ? corpo.error : "";
  if (/already exists/i.test(erro)) return null;
  return `produto: ${resumir(erro || `HTTP ${resposta.status}`)}`;
}

export async function solicitarCobranca(token: string, pedido: PedidoDeCobranca): Promise<ResultadoDaCobranca> {
  for (const produto of pedido.products) {
    const falha = await cadastrarProduto(token, produto);
    if (falha) return { status: "recusada", motivo: falha };
  }

  let resposta: Response;
  try {
    resposta = await postar(token, URL_DE_COBRANCA, {
      items: pedido.products.map((produto) => ({ id: idDoProduto(produto), quantity: produto.quantity })),
      methods: ["PIX"],
      returnUrl: pedido.returnUrl,
      completionUrl: pedido.completionUrl,
      ...(pedido.products.length === 1 ? { externalId: pedido.products[0].externalId } : {}),
    });
  } catch (erro) {
    // Timeout ou rede: a requisição pode ter chegado e a cobrança existir.
    return { status: "incerta", motivo: descrever(erro) };
  }

  let corpo: { success?: unknown; error?: unknown; data?: { id?: unknown; url?: unknown; amount?: unknown } } | null;
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
      // O servidor é a autoridade no preço: um checkout com outro valor
      // (produto editado no painel, cadastro antigo) não é entregue ao
      // cliente. A cobrança existe no gateway, então é incerta, não recusada.
      const esperado = pedido.products.reduce((soma, p) => soma + p.price * p.quantity, 0);
      const cobrado = corpo.data?.amount;
      if (cobrado !== esperado) {
        return {
          status: "incerta",
          motivo: `checkout ${billingId} com valor ${String(cobrado)}, esperado ${esperado} centavos`,
        };
      }
      return { status: "criada", billingId, url };
    }
    // Declarou sucesso sem identificar a cobrança: não dá para seguir nem para desfazer.
    return { status: "incerta", motivo: "sucesso sem id ou url da cobrança" };
  }

  // O gateway respondeu e declarou a falha: a cobrança não foi criada.
  if ((resposta.ok && corpo?.success === false) || ehErroDoCliente(resposta.status)) {
    const motivo = typeof corpo?.error === "string" && corpo.error ? corpo.error : `HTTP ${resposta.status}`;
    return { status: "recusada", motivo: resumir(motivo) };
  }

  return { status: "incerta", motivo: `HTTP ${resposta.status} sem confirmação` };
}
