import { normalizeConfig, type EyewearConfig } from "../../eyewear/config";
import { calculateBasePrice } from "../../utils/pricing";

export interface StudioModel {
  id: string;
  name: string;
  shape: "round" | "square";
  material: "metal" | "acetate" | "titanium";
  image: string;
  config: EyewearConfig;
  price: number;
}
function model(
  id: string,
  name: string,
  shape: StudioModel["shape"],
  material: StudioModel["material"],
  image: string,
  options: Partial<EyewearConfig> = {},
): StudioModel {
  const config = normalizeConfig({
    shape,
    material,
    color: material === "acetate" ? "#382016" : "#777a78",
    lensTreatments: [],
    ...options,
  });
  return {
    id,
    name,
    shape,
    material,
    image: `/eyewear/${image}.png`,
    config,
    price: calculateBasePrice(config),
  };
}
// Existing entry points and pricing, now carrying explicit appearance into the Studio.
export const studioModels: StudioModel[] = [
  model("base-round-metal", "Aero Round", "round", "metal", "aero-round"),
  model(
    "base-square-acetate",
    "Nova Square",
    "square",
    "acetate",
    "nova-square",
    { frameProfile: "bold", finish: "tortoise" },
  ),
  model("base-round-acetate", "Luna Frame", "round", "acetate", "luna-frame", {
    color: "#314838",
  }),
  model("base-square-metal", "Titan Edge", "square", "titanium", "titan-edge"),
];
export const shapeLabel = (shape: string, pt: boolean) =>
  shape === "round" ? (pt ? "Redondo" : "Round") : pt ? "Quadrado" : "Square";
export const materialLabel = (material: string, pt: boolean) =>
  material === "acetate"
    ? pt
      ? "Acetato"
      : "Acetate"
    : material === "titanium"
      ? pt
        ? "Titânio"
        : "Titanium"
      : "Metal";
export const foldText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
export function filterModels(
  query: string,
  shapes: string[],
  materials: string[],
  sort: string,
  favorites: string[],
) {
  const search = foldText(query);
  const result = studioModels.filter(
    (p) =>
      (!shapes.length || shapes.includes(p.shape)) &&
      (!materials.length || materials.includes(p.material)) &&
      foldText(
        [
          p.name,
          p.shape,
          p.material,
          shapeLabel(p.shape, true),
          materialLabel(p.material, true),
        ].join(" "),
      ).includes(search),
  );
  return result.sort((a, b) =>
    sort === "price-asc"
      ? a.price - b.price
      : sort === "price-desc"
        ? b.price - a.price
        : sort === "name-asc"
          ? a.name.localeCompare(b.name)
          : Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)),
  );
}
export interface StoreProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string | null;
  category: string;
  stock: number | null;
}
export interface StorePage {
  products: StoreProduct[];
  total: number;
  totalPages: number;
}
export async function fetchStorePage(
  page: number,
  query: string,
  signal: AbortSignal,
): Promise<StorePage> {
  let api = (
    import.meta.env.VITE_API_URL || "http://localhost:5000/api"
  ).replace(/\/$/, "");
  if (!api.endsWith("/api")) api += "/api";
  const params = new URLSearchParams({
    page: String(page),
    limit: "12",
    search: query,
  });
  const response = await fetch(`${api}/products?${params}`, { signal });
  if (!response.ok) throw new Error("Catalog unavailable");
  const data = await response.json();
  if (!data.success || !Array.isArray(data.produtos))
    throw new Error("Invalid catalog response");
  const total = Number(data.total),
    totalPages = Number(data.totalPages);
  if (
    !Number.isInteger(total) ||
    total < 0 ||
    !Number.isInteger(totalPages) ||
    totalPages < 0
  )
    throw new Error("Invalid pagination");
  const products = data.produtos.map(
    (p: Record<string, unknown>): StoreProduct => {
      const price = Number(p.preco);
      if (
        p.id == null ||
        typeof p.nome !== "string" ||
        p.preco == null ||
        !Number.isFinite(price) ||
        price < 0
      )
        throw new Error("Invalid product");
      return {
        id: String(p.id),
        name: p.nome,
        price,
        description: typeof p.descricao === "string" ? p.descricao : "",
        image:
          typeof p.imagem_url === "string" &&
          /^(https?:\/\/|\/(?!\/))/.test(p.imagem_url)
            ? p.imagem_url
            : null,
        category: typeof p.categoria_nome === "string" ? p.categoria_nome : "",
        stock:
          p.estoque_quantidade == null ? null : Number(p.estoque_quantidade),
      };
    },
  );
  return { products, total, totalPages };
}
