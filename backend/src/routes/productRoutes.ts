// ============================================================
//   PRODUCT ROUTES
//   Base: /api/products
// ============================================================

import express from "express";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
} from "../controllers/productController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// Rotas públicas (qualquer pessoa pode ver produtos)
router.get("/",    getProducts);
router.get("/:id", getProductById);

// Rotas protegidas (somente staff pode criar/editar/deletar)
router.post(  "/",    protect, authorize("staff"), createProduct);
router.put(   "/:id", protect, authorize("staff"), updateProduct);
router.delete("/:id", protect, authorize("staff"), deleteProduct);

export default router;
