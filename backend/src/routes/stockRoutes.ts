// ============================================================
//   STOCK ROUTES
//   Base: /api/stock
// ============================================================

import express from "express";
import {
  getAllStock,
  getStockByProduct,
  updateStock,
  getStockAlerts
} from "../controllers/stockController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// Todas as rotas de estoque são protegidas
router.use(protect);

// Staff e factory podem ver o estoque
router.get("/",                          authorize("staff", "factory"), getAllStock);
router.get("/alerts",                    authorize("staff", "factory"), getStockAlerts);
router.get("/product/:produtoId",        authorize("staff", "factory"), getStockByProduct);

// Apenas staff pode modificar o estoque
router.put("/product/:produtoId",        authorize("staff"),            updateStock);

export default router;
