// ============================================================
//   UM PEDIDO POR FÁBRICA (FEAT-04, ADR-0004)
//
//   O pedido é a unidade de fabricação: status, fábrica dona e
//   versão são dele. No checkout, os itens do carrinho que vão para
//   a mesma fábrica viram um pedido só.
// ============================================================

/**
 * Agrupa os índices dos itens pela fábrica de cada um. Os grupos saem na
 * ordem em que cada fábrica aparece no carrinho, e os itens de cada grupo
 * na ordem do carrinho. `null` (nenhuma fábrica cadastrada) é um grupo
 * como os outros.
 */
export function agruparPorFabrica(fabricaDeCadaItem: readonly (number | null)[]): number[][] {
  const grupos = new Map<number | null, number[]>();
  fabricaDeCadaItem.forEach((fabrica, indice) => {
    const grupo = grupos.get(fabrica);
    if (grupo) grupo.push(indice);
    else grupos.set(fabrica, [indice]);
  });
  return [...grupos.values()];
}
