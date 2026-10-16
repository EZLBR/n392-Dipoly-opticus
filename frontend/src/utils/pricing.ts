// Prévia do preço exibida no Studio e no carrinho. O valor cobrado é
// calculado pelo servidor (backend/src/domain/pricing.ts), que ignora o
// total enviado pelo navegador. Ao mudar esta regra, mude a do servidor
// também: um teste do backend compara as duas em todas as combinações.
export function calculateBasePrice({
  isSunglasses = false,
  frameProfile = "standard",
  lensTreatments = [],
  frameMaterial = "acetate",
  lensMaterial = "cr39"
} = {}) {
  let basePrice = 180;

  if (isSunglasses) basePrice += 40;
  if (frameProfile === "bold") basePrice += 20;
  if (lensTreatments && lensTreatments.length > 0) {
    basePrice += (lensTreatments.length * 15);
  }

  const premiumMaterials = ["titanium", "gold", "carbon_fiber"];
  if (premiumMaterials.includes(frameMaterial)) {
    basePrice += 80;
  }

  if (lensMaterial === "polycarbonate") {
    basePrice += 30;
  }

  return basePrice;
}
