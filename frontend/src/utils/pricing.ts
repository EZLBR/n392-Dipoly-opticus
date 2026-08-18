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
