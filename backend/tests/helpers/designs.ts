// ============================================================
//   Fixtures de design salvo
//
//   Cria direto pelo Prisma para montar o estado; os testes
//   exercitam a autorização pela API.
// ============================================================

import prisma from "../../src/config/prisma.js";
import type { UsuarioDeTeste } from "./auth.js";

export interface DesignDeTeste {
  id: string;
  name: string;
  color: string;
}

let contador = 0;

export async function criarDesign(dono: UsuarioDeTeste): Promise<DesignDeTeste> {
  const n = ++contador;
  return prisma.savedDesign.create({
    data: {
      id: `design-teste-${n}-${Date.now()}`,
      usuarioId: dono.id,
      customerEmail: dono.email,
      name: `Design Teste ${n}`,
      model: "aviador",
      color: "#1a1a1a",
    },
    select: { id: true, name: true, color: true },
  });
}

/** Releitura sem escopo, para verificar se a tentativa negada alterou algo. */
export async function lerDesign(id: string) {
  return prisma.savedDesign.findUnique({
    where: { id },
    select: { id: true, usuarioId: true, customerEmail: true, name: true, color: true },
  });
}
