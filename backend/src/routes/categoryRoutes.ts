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
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// Rotas públicas
router.get("/",    getCategories);
router.get("/:id", getCategoryById);

// Somente staff gerencia categorias
router.post(  "/",    protect, authorize("staff"), createCategory);
router.put(   "/:id", protect, authorize("staff"), updateCategory);
router.delete("/:id", protect, authorize("staff"), deleteCategory);

export default router;
