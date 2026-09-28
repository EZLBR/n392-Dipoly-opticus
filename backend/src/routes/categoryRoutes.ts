// ============================================================
//   CATEGORY ROUTES
//   Base: /api/categories
// ============================================================

import express from "express";
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} from "../controllers/categoryController.js";
import { routerGuard } from "../middlewares/routerGuard.js";

const router = express.Router();

// Rotas públicas
router.get("/",    getCategories);
router.get("/:id", getCategoryById);

// Somente staff gerencia categorias
router.post(  "/",    routerGuard("staff"), createCategory);
router.put(   "/:id", routerGuard("staff"), updateCategory);
router.delete("/:id", routerGuard("staff"), deleteCategory);

export default router;
