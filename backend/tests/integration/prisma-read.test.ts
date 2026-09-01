import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { limparBanco, assertBancoDeTeste } from "../setup/db.js";
import { initializeDatabase } from "../../src/config/db.js";

// O teste executa operações destrutivas no banco (prisma db push
// --accept-data-loss e DROP SCHEMA). Para nunca apontar acidentalmente
// para um banco com dados reais, a URL é derivada do ambiente de teste
// (.env.test / DATABASE_URL) e validada pela guarda assertBancoDeTeste(),
// que se recusa a rodar se o banco não terminar em "_test".
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
    // Falha rápido antes de qualquer db push/DROP SCHEMA se a DATABASE_URL
    // não apontar para um banco dedicado de teste (_test).
    assertBancoDeTeste();
    await limparBanco();
    // Temporário: empurrar o schema do Prisma pro banco antes dos testes
    // No Bloco 2 isso será trocado por migrations.
    execSync("npx prisma db push --accept-data-loss", {
      env: {
        ...process.env,
        DATABASE_URL: testUrl
      },
      stdio: "inherit"
    });
  });

  afterAll(async () => {
    // O db push do Prisma altera o schema de uma forma que o
    // initializeDatabase do legado (CREATE TABLE IF NOT EXISTS) não
    // consegue desfazer na próxima execução. Então restauramos o schema
    // original aqui, para (a) a próxima execução do vitest começar limpa
    // e (b) os demais arquivos de teste deste mesmo run, que dependem do
    // schema legado, continuarem funcionando.
    assertBancoDeTeste();
    const pgPool = (await import("../../src/config/db.js")).default;
    await pgPool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await initializeDatabase();
    await prisma.$disconnect();
  });

  it("Lê um produto usando Prisma retornando os tipos corretos", async () => {
    // Inserir um fixture
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
    
    // Validar tipo Decimal
    expect(Number(produto?.preco)).toBe(199.99);
    
    // Validar publicId
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
    
    // Validar enum de domínio
    expect(dbPedido?.status).toBe("Pending_Payment");
    
    // Validar version para concorrência
    expect(dbPedido?.version).toBe(0);
    
    // Validar relações com a fábrica
    expect(dbPedido?.factoryId).toBe(factory.id);
  });
});
