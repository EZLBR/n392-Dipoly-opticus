// ============================================================
//   DESIGN CONTROLLER — Designs salvos no Creator Studio
//   Migrado para PostgreSQL (pg, $1)
// ============================================================

import pool from "../config/db.js";

// ─────────────────────────────────────────────────────────
//   SALVAR DESIGN (cria ou atualiza)
//   POST /api/designs
// ─────────────────────────────────────────────────────────
export async function saveDesign(req, res) {
  const {
    id, name, model, color,
    is_sunglasses, anti_reflective, temple_style,
    top_bar, bridge_style, frame_profile, temple_open, published
  } = req.body;

  const customerEmail = req.user.email;
  const usuarioId     = req.user.id;

  if (!name || !model || !color) {
    return res.status(400).json({ success: false, error: "Nome, modelo e cor são obrigatórios." });
  }

  // Handle ID. If frontend sends null (because of new fix), generate a design ID
  const finalId = id || `design-${Date.now()}`;

  try {
    if (id) {
      const { rows: existing } = await pool.query(
        "SELECT id FROM saved_designs WHERE id = $1 AND customer_email = $2",
        [finalId, customerEmail]
      );

      if (existing.length > 0) {
        await pool.query(
          `UPDATE saved_designs SET
            name = $1, model = $2, color = $3,
            is_sunglasses = $4, anti_reflective = $5, temple_style = $6,
            top_bar = $7, bridge_style = $8, frame_profile = $9,
            temple_open = $10, published = $11, updated_at = CURRENT_TIMESTAMP
           WHERE id = $12 AND customer_email = $13`,
          [
            name, model, color,
            Boolean(is_sunglasses), Boolean(anti_reflective), temple_style || "standard",
            Boolean(top_bar), bridge_style || "keyhole", frame_profile || "medium",
            temple_open || 0.00, Boolean(published),
            finalId, customerEmail
          ]
        );

        return res.json({ success: true, message: "Design atualizado com sucesso.", id: finalId });
      }
    }

    const { rows: result } = await pool.query(
      `INSERT INTO saved_designs
        (id, usuario_id, customer_email, name, model, color,
         is_sunglasses, anti_reflective, temple_style,
         top_bar, bridge_style, frame_profile, temple_open, published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        finalId, usuarioId, customerEmail, name, model, color,
        Boolean(is_sunglasses), Boolean(anti_reflective), temple_style || "standard",
        Boolean(top_bar), bridge_style || "keyhole", frame_profile || "medium",
        temple_open || 0.00, Boolean(published)
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Design salvo com sucesso.",
      id:      result[0].id
    });

  } catch (err) {
    console.error("Erro ao salvar design:", err);
    return res.status(500).json({ success: false, error: "Falha ao salvar design." });
  }
}

// ─────────────────────────────────────────────────────────
//   LISTAR DESIGNS DO USUÁRIO
//   GET /api/designs
// ─────────────────────────────────────────────────────────
export async function getDesigns(req, res) {
  const customerEmail = req.user.email;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM saved_designs WHERE customer_email = $1 ORDER BY created_at DESC",
      [customerEmail]
    );

    const designs = rows.map(row => ({
      id:             row.id,
      name:           row.name,
      model:          row.model,
      color:          row.color,
      isSunglasses:   Boolean(row.is_sunglasses),
      antiReflective: Boolean(row.anti_reflective),
      templeStyle:    row.temple_style,
      topBar:         Boolean(row.top_bar),
      bridgeStyle:    row.bridge_style,
      frameProfile:   row.frame_profile,
      templeOpen:     Number(row.temple_open),
      published:      Boolean(row.published),
      createdAt:      row.created_at,
      updatedAt:      row.updated_at
    }));

    return res.json({ success: true, designs });

  } catch (err) {
    console.error("Erro ao buscar designs:", err);
    return res.status(500).json({ success: false, error: "Falha ao carregar designs." });
  }
}

// ─────────────────────────────────────────────────────────
//   DELETAR DESIGN
//   DELETE /api/designs/:id
// ─────────────────────────────────────────────────────────
export async function deleteDesign(req, res) {
  const { id }       = req.params;
  const customerEmail = req.user.email;

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM saved_designs WHERE id = $1 AND customer_email = $2",
      [id, customerEmail]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: "Design não encontrado ou sem permissão." });
    }

    return res.json({ success: true, message: "Design removido com sucesso." });

  } catch (err) {
    console.error("Erro ao deletar design:", err);
    return res.status(500).json({ success: false, error: "Falha ao remover design." });
  }
}
