-- ════════════════════════════════════════════════════════════
--   LEGADO — NÃO é mais a fonte de verdade do schema.
--   Desde 2026-09-01 (PR de Bloco 2: Prisma Migrations cutover).
--   Ver `prisma/schema.prisma` e `prisma/migrations/`.
--
--   Mantido apenas para referência histórica / rollback.
--   Não use para restaurar ou evoluir o banco.
-- ════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────
-- 1. CATEGORIAS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(100)  NOT NULL,
  descricao   TEXT,
  criado_em   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────────────────
-- 2. USUARIOS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  UNIQUE NOT NULL,
  senha_hash    VARCHAR(255)  NOT NULL,
  role          VARCHAR(50)   DEFAULT 'client' CHECK (role IN ('client', 'factory', 'staff')),
  factory_name  VARCHAR(255),
  criado_em     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────────────────
-- 3. PRODUTOS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produtos (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(255)  NOT NULL,
  descricao     TEXT,
  preco         DECIMAL(10, 2) NOT NULL,
  categoria_id  INT,
  imagem_url    VARCHAR(500),
  ativo         BOOLEAN       DEFAULT TRUE,
  criado_em     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_produto_categoria
    FOREIGN KEY (categoria_id)
    REFERENCES categorias(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

-- ──────────────────────────────────────────────────────────
-- 4. PEDIDOS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos (
  id                  SERIAL PRIMARY KEY,
  usuario_id          INT           NOT NULL,
  customer_name       VARCHAR(255)  NOT NULL,
  customer_email      VARCHAR(255)  NOT NULL,
  product_name        VARCHAR(255)  NOT NULL,
  factory_id          INT,
  factory_name        VARCHAR(255),
  status              VARCHAR(50)   DEFAULT 'Pending Payment' CHECK (status IN ('Pending Payment', 'Queued', 'In production', 'Delivered', 'Cancelled')),
  total               DECIMAL(10, 2) NOT NULL,
  custom_specs        TEXT,
  abacate_billing_id  VARCHAR(255),
  criado_em           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_pedido_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_pedido_fabrica
    FOREIGN KEY (factory_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL
);

-- ──────────────────────────────────────────────────────────
-- 5. PEDIDO_ITENS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_itens (
  id              SERIAL PRIMARY KEY,
  pedido_id       INT           NOT NULL,
  produto_id      INT           NOT NULL,
  quantidade      INT           NOT NULL DEFAULT 1,
  preco_unitario  DECIMAL(10, 2) NOT NULL,

  CONSTRAINT fk_item_pedido
    FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_item_produto
    FOREIGN KEY (produto_id)
    REFERENCES produtos(id)
    ON DELETE RESTRICT
);

-- ──────────────────────────────────────────────────────────
-- 6. ESTOQUE
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estoque (
  id              SERIAL PRIMARY KEY,
  produto_id      INT  NOT NULL UNIQUE,
  quantidade      INT  NOT NULL DEFAULT 0,
  estoque_minimo  INT  DEFAULT 5,
  atualizado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_estoque_produto
    FOREIGN KEY (produto_id)
    REFERENCES produtos(id)
    ON DELETE CASCADE
);

-- ──────────────────────────────────────────────────────────
-- 7. PAGAMENTOS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagamentos (
  id                  SERIAL PRIMARY KEY,
  pedido_id           INT           NOT NULL,
  metodo              VARCHAR(50)   DEFAULT 'pix' CHECK (metodo IN ('pix', 'cartao_credito', 'boleto')),
  status              VARCHAR(50)   DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado', 'estornado')),
  valor               DECIMAL(10, 2) NOT NULL,
  referencia_externa  VARCHAR(255),
  criado_em           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_pagamento_pedido
    FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id)
    ON DELETE CASCADE
);

-- ──────────────────────────────────────────────────────────
-- 8. SAVED_DESIGNS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_designs (
  id              SERIAL PRIMARY KEY,
  usuario_id      INT           NOT NULL,
  customer_email  VARCHAR(255)  NOT NULL,
  nome            VARCHAR(255)  NOT NULL,
  modelo          VARCHAR(255)  NOT NULL,
  cor             VARCHAR(50)   NOT NULL,
  is_sunglasses   BOOLEAN       DEFAULT FALSE,
  anti_reflective BOOLEAN       DEFAULT FALSE,
  temple_style    VARCHAR(50)   DEFAULT 'standard',
  top_bar         BOOLEAN       DEFAULT FALSE,
  bridge_style    VARCHAR(50)   DEFAULT 'keyhole',
  frame_profile   VARCHAR(50)   DEFAULT 'medium',
  temple_open     DECIMAL(4, 2) DEFAULT 0.00,
  published       BOOLEAN       DEFAULT FALSE,
  criado_em       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_design_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE CASCADE
);

-- ============================================================
--   ÍNDICES DE PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_produtos_categoria  ON produtos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario     ON pedidos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_factory     ON pedidos(factory_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status      ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_billing     ON pedidos(abacate_billing_id);
CREATE INDEX IF NOT EXISTS idx_itens_pedido        ON pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_itens_produto       ON pedido_itens(produto_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pedido   ON pagamentos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_designs_usuario     ON saved_designs(usuario_id);
CREATE INDEX IF NOT EXISTS idx_designs_email       ON saved_designs(customer_email);
