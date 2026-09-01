import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { limparBanco, assertBancoDeTeste } from "../setup/db.js";

const testUrl = process.env.DATABASE_URL?.trim();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: testUrl
    }
  }
});

describe("Prisma - Leitura Real", () => {
  beforeAll(async () => {
    assertBancoDeTeste();
    await limparBanco();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("Lê um produto usando Prisma retornando os tipos corretos", async () => {
    await prisma.categoria.create({
      data: {
        id: 9999,
        nome: "Categoria Prisma Test",
        descricao: "Teste real do Prisma"
      }
    });

    await prisma.produto.create({
      data: {
        id: 9999,
        nome: "Produto Prisma Test",
        preco: 199.99,
        categoriaId: 9999,
        ativo: true
      }
    });

    const produto = await prisma.produto.findUnique({
      where: { id: 9999 },
      include: {
        categoria: true
      }
    });

    expect(produto).toBeDefined();
    expect(produto?.nome).toBe("Produto Prisma Test");
    
    expect(Number(produto?.preco)).toBe(199.99);
    
    expect(produto?.publicId).toBeDefined();
    expect(typeof produto?.publicId).toBe("string");
  });
  
  it("Lê um pedido usando Prisma, validando enums e concurrency tokens", async () => {
    const user = await prisma.usuario.create({
      data: {
        nome: "Comprador",
        email: "comprador@test.com",
        senhaHash: "123",
        role: "client"
      }
    });

    const factory = await prisma.usuario.create({
      data: {
        nome: "Fábrica Teste",
        email: "fabrica@test.com",
        senhaHash: "123",
        role: "factory"
      }
    });

    const pedido = await prisma.pedido.create({
      data: {
        usuarioId: user.id,
        factoryId: factory.id,
        customerName: "Teste Comprador",
        customerEmail: "comprador@test.com",
        productName: "Oculos Prisma",
        status: "Pending_Payment",
        total: 250.50
      }
    });
    
    const dbPedido = await prisma.pedido.findUnique({ where: { id: pedido.id }});
    
    expect(dbPedido?.status).toBe("Pending_Payment");
    
    expect(dbPedido?.version).toBe(0);
    
    expect(dbPedido?.factoryId).toBe(factory.id);
  });
});
