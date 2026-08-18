// ============================================================
//   OPTICUS — Conexão com PostgreSQL
//   Driver   : pg
//   Estratégia: Pool de conexões (reutiliza, não reabre)
// ============================================================

import pg from "pg";
import type { PoolConfig } from "pg";
const { Pool } = pg;
import dotenv from "dotenv";
import logger from "../utils/logger.js";
dotenv.config();

const poolConfig: PoolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    }
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      database: process.env.DB_NAME || "opticus_db",
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    };

// Always use SSL for Supabase to prevent connection hangs
if (process.env.DB_SSL === "true" ||
   (poolConfig.host && poolConfig.host.includes("supabase.com")) ||
   (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("supabase.com"))) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

async function createIndexIfNotExists(tableName, indexName, indexDef) {
  const query = `
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = $1 AND n.nspname = 'public'
  `;
  const { rows } = await pool.query(query, [indexName]);
  if (rows.length === 0) {
    await pool.query(`CREATE INDEX ${indexName} ON ${tableName} (${indexDef})`);
  }
}

export async function initializeDatabase() {
  try {
    const { rows: infoRows } = await pool.query("SELECT NOW() AS agora, version() AS versao");
    logger.info(`✅ PostgreSQL conectado — versão ${infoRows[0].versao.split(" ")[1]} (${infoRows[0].agora})`);

    // ── TABELA: categorias ────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id        SERIAL PRIMARY KEY,
        nome      VARCHAR(100)  NOT NULL,
        descricao TEXT,
        criado_em TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── TABELA: usuarios ──────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id           SERIAL PRIMARY KEY,
        nome         VARCHAR(255) NOT NULL,
        email        VARCHAR(255) UNIQUE NOT NULL,
        senha_hash   VARCHAR(255) NOT NULL,
        role         VARCHAR(50) DEFAULT 'client' CHECK (role IN ('client','factory','staff')),
        factory_name VARCHAR(255),
        criado_em    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── TABELA: produtos ──────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produtos (
        id           SERIAL PRIMARY KEY,
        nome         VARCHAR(255)   NOT NULL,
        descricao    TEXT,
        preco        DECIMAL(10,2)  NOT NULL,
        categoria_id INT,
        imagem_url   VARCHAR(500),
        ativo        BOOLEAN        DEFAULT TRUE,
        criado_em    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_produto_categoria
          FOREIGN KEY (categoria_id) REFERENCES categorias(id)
          ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    // ── TABELA: pedidos ───────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id                 SERIAL PRIMARY KEY,
        usuario_id         INT           NOT NULL,
        customer_name      VARCHAR(255)  NOT NULL,
        customer_email     VARCHAR(255)  NOT NULL,
        product_name       VARCHAR(255)  NOT NULL,
        factory_id         INT,
        factory_name       VARCHAR(255),
        status             VARCHAR(50)   DEFAULT 'Pending Payment'
                           CHECK (status IN ('Pending Payment','Queued','In production','Delivered','Cancelled')),
        total              DECIMAL(10,2) NOT NULL,
        custom_specs       TEXT,
        abacate_billing_id VARCHAR(255),
        criado_em          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        atualizado_em      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_pedido_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT fk_pedido_fabrica
          FOREIGN KEY (factory_id) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);

    // ── TABELA: pedido_itens ──────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedido_itens (
        id             SERIAL PRIMARY KEY,
        pedido_id      INT           NOT NULL,
        produto_id     INT           NOT NULL,
        quantidade     INT           NOT NULL DEFAULT 1,
        preco_unitario DECIMAL(10,2) NOT NULL,
        CONSTRAINT fk_item_pedido
          FOREIGN KEY (pedido_id)  REFERENCES pedidos(id)  ON DELETE CASCADE,
        CONSTRAINT fk_item_produto
          FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT
      )
    `);

    // ── TABELA: estoque ───────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS estoque (
        id             SERIAL PRIMARY KEY,
        produto_id     INT NOT NULL UNIQUE,
        quantidade     INT NOT NULL DEFAULT 0,
        estoque_minimo INT DEFAULT 5,
        atualizado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_estoque_produto
          FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
      )
    `);

    // ── TABELA: pagamentos ────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pagamentos (
        id                 SERIAL PRIMARY KEY,
        pedido_id          INT           NOT NULL,
        metodo             VARCHAR(50)   DEFAULT 'pix' CHECK (metodo IN ('pix','cartao_credito','boleto')),
        status             VARCHAR(50)   DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','recusado','estornado')),
        valor              DECIMAL(10,2) NOT NULL,
        referencia_externa VARCHAR(255),
        criado_em          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_pagamento_pedido
          FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
      )
    `);

    // ── TABELA: saved_designs ─────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_designs (
        id              VARCHAR(255)  PRIMARY KEY,
        usuario_id      INT           NOT NULL,
        customer_email  VARCHAR(255)  NOT NULL,
        name            VARCHAR(255)  NOT NULL,
        model           VARCHAR(255)  NOT NULL,
        color           VARCHAR(50)   NOT NULL,
        is_sunglasses   BOOLEAN       DEFAULT FALSE,
        anti_reflective BOOLEAN       DEFAULT FALSE,
        temple_style    VARCHAR(50)   DEFAULT 'standard',
        top_bar         BOOLEAN       DEFAULT FALSE,
        bridge_style    VARCHAR(50)   DEFAULT 'keyhole',
        frame_profile   VARCHAR(50)   DEFAULT 'medium',
        temple_open     NUMERIC       DEFAULT 0.00,
        published       BOOLEAN       DEFAULT FALSE,
        created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_design_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `);

    logger.info("✅ Tabelas verificadas/criadas com sucesso no PostgreSQL.");

    const indexes = [
      ["produtos",      "idx_produtos_categoria",  "categoria_id"],
      ["pedidos",       "idx_pedidos_usuario",      "usuario_id"],
      ["pedidos",       "idx_pedidos_factory",      "factory_id"],
      ["pedidos",       "idx_pedidos_status",       "status"],
      ["pedidos",       "idx_pedidos_billing",      "abacate_billing_id"],
      ["pedido_itens",  "idx_itens_pedido",         "pedido_id"],
      ["pedido_itens",  "idx_itens_produto",        "produto_id"],
      ["pagamentos",    "idx_pagamentos_pedido",    "pedido_id"],
      ["saved_designs", "idx_designs_usuario",      "usuario_id"],
      ["saved_designs", "idx_designs_email",        "customer_email"],
    ];

    for (const [table, name, col] of indexes) {
      await createIndexIfNotExists(table, name, col);
    }

    logger.info("✅ Índices de performance verificados.");

    const { rows: categoryCount } = await pool.query("SELECT COUNT(*) AS total FROM categorias");
    if (Number(categoryCount[0].total) === 0) {
      logger.info("🌱 Catálogo vazio — inserindo produtos iniciais...");
      await pool.query(
        `INSERT INTO categorias (nome, descricao) VALUES
          ('Óculos de Sol', 'Armações com lente solar polarizada'),
          ('Armações',      'Armações para lentes de grau'),
          ('Lentes',        'Lentes avulsas e sob medida'),
          ('Acessórios',    'Cases, cordões e kits de limpeza')`
      );

      const { rows: catSolRows } = await pool.query("SELECT id FROM categorias WHERE nome = 'Óculos de Sol'");
      const { rows: catArmacaoRows } = await pool.query("SELECT id FROM categorias WHERE nome = 'Armações'");

      const { rows: p1Rows } = await pool.query(
        `INSERT INTO produtos (nome, descricao, preco, categoria_id, ativo)
         VALUES ('Model Aurora', 'Óculos de sol premium com lente polarizada UV400', 450.00, $1, TRUE) RETURNING id`,
        [catSolRows[0].id]
      );

      const { rows: p2Rows } = await pool.query(
        `INSERT INTO produtos (nome, descricao, preco, categoria_id, ativo)
         VALUES ('Model Vertex', 'Armação de titânio ultra leve para grau', 320.00, $1, TRUE) RETURNING id`,
        [catArmacaoRows[0].id]
      );

      await pool.query(
        `INSERT INTO estoque (produto_id, quantidade, estoque_minimo) VALUES ($1, 50, 10), ($2, 30, 5)`,
        [p1Rows[0].id, p2Rows[0].id]
      );

      logger.info("✅ Catálogo inicial inserido sem criar usuários ou credenciais demo.");
    }
  } catch (err) {
    logger.fatal({ err }, "❌ Falha ao inicializar o banco PostgreSQL");
    process.exit(1);
  }
}

export default pool;
