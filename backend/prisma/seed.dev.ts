// ============================================================
//   SEED DE DESENVOLVIMENTO — OPTICUS
//
//   NÃO Rode em produção. Contém dados fake (usuários de
//   exemplo, produtos e pedidos de demonstração) que só fazem
//   sentido num ambiente local/CI.
//
//   Como rodar (apenas em dev):
//     npm run seed:dev
//
//   Segurança: usa senha de teste explicitamente fake e um
//   domínio .invalid que não pode ser entregue por email.
// ============================================================

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

const prisma = new PrismaClient();

const SENHA_DEV = "Dev123456";

async function main() {
  // Usuários de exemplo (papéis distintos)
  const cliente = await prisma.usuario.upsert({
    where: { email: "cliente@exemplo.invalid" },
    update: {},
    create: {
      nome: "Cliente Desenvolvimento",
      email: "cliente@exemplo.invalid",
      senhaHash: await bcrypt.hash(SENHA_DEV, 10),
      role: "client",
    },
  });

  const fabrica = await prisma.usuario.upsert({
    where: { email: "fabrica@exemplo.invalid" },
    update: {},
    create: {
      nome: "Fábrica Desenvolvimento",
      email: "fabrica@exemplo.invalid",
      senhaHash: await bcrypt.hash(SENHA_DEV, 10),
      role: "factory",
      factoryName: "Óptica Exemplar LTDA",
    },
  });

  // Categorias (referência; upsert para idempotência)
  const catSol = await prisma.categoria.upsert({
    where: { nome: "Óculos de Sol" },
    update: {},
    create: { nome: "Óculos de Sol" },
  });

  // Produtos de demonstração
  let prodAurora = await prisma.produto.findFirst({
    where: { nome: "Model Aurora" },
  });

  if (!prodAurora) {
    prodAurora = await prisma.produto.create({
      data: {
        nome: "Model Aurora",
        descricao: "Óculos de sol premium com lente polarizada UV400",
        preco: 450,
        categoriaId: catSol.id,
        ativo: true,
      },
    });
  } else {
    prodAurora = await prisma.produto.update({
      where: { id: prodAurora.id },
      data: { categoriaId: catSol.id, ativo: true },
    });
  }

  let estoqueAurora = await prisma.estoque.findUnique({
    where: { produtoId: prodAurora.id },
  });
  if (!estoqueAurora) {
    estoqueAurora = await prisma.estoque.create({
      data: { produtoId: prodAurora.id, quantidade: 50, estoqueMinimo: 10 },
    });
  }

  // Pedido de exemplo
  const pedido = await prisma.pedido.upsert({
    where: { id: 1 },
    update: {},
    create: {
      usuarioId: cliente.id,
      factoryId: fabrica.id,
      customerName: cliente.nome,
      customerEmail: cliente.email,
      productName: prodAurora.nome,
      status: "Delivered",
      total: 450,
    },
  });

  console.log("✅ SEED DEV: dados de desenvolvimento garantidos.");
  console.log(
    `   Usuário cliente: cliente@exemplo.invalid / ${SENHA_DEV}\n` +
      `   Usuário fábrica: fabrica@exemplo.invalid / ${SENHA_DEV}\n` +
      `   Pedido dev id=${pedido.id}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
