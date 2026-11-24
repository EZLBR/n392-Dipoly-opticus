/**
 * Preço em reais, no formato do idioma da tela (pt: "R$ 1.234,56"; en: "R$1,234.56").
 * A cobrança é em BRL (Pix pelo AbacatePay), então todas as telas mostram BRL.
 */
export function formatMoney(value: number, language: string): string {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}
