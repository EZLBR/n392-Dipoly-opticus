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
import { routerGuard } from "../middlewares/routerGuard.js";
import { validateBody } from "../middlewares/validate.js";
import { updateStockSchema } from "../dtos/stock/stock.dto.js";

const router = express.Router();

// Todas as rotas de estoque são protegidas
router.use(routerGuard());

// Staff e factory podem ver o estoque
router.get("/",                          routerGuard("staff", "factory"), getAllStock);
router.get("/alerts",                    routerGuard("staff", "factory"), getStockAlerts);
router.get("/product/:produtoId",        routerGuard("staff", "factory"), getStockByProduct);

// Apenas staff pode modificar o estoque
router.put("/product/:produtoId",        routerGuard("staff"), validateBody(updateStockSchema), updateStock);

export default router;
