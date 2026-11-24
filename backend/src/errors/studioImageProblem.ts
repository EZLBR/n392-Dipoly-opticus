import { HttpProblem, problemType } from "./problem.js";

const imageProblems = {
  "studio-image-size": [413, "A imagem deve ter até 5 MiB."],
  "studio-image-format": [415, "Use uma imagem PNG, JPEG ou WebP."],
  "studio-image-invalid": [400, "Use uma imagem estática válida de até 4096 × 4096 pixels."],
  "studio-image-crop": [400, "O recorte deve conter pelo menos um pixel em cada direção."],
  "studio-image-quota": [409, "Limite de imagens atingido. Remova um envio que não esteja em uso."],
  "studio-image-in-use": [409, "Esta imagem está vinculada a um design salvo."],
  "studio-image-upgrade": [409, "Atualize o Studio para editar um design com imagens."],
  "studio-image-not-found": [404, "Imagem não encontrada."],
} as const;

export class StudioImageProblem extends HttpProblem {
  readonly type: string;
  readonly title: string;
  readonly status: number;

  constructor(slug: keyof typeof imageProblems) {
    const [status, detail] = imageProblems[slug];
    super(detail);
    this.status = status;
    this.title = detail;
    this.type = problemType(slug);
  }
}
