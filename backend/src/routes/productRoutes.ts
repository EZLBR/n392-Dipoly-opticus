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
import { routerGuard } from "../middlewares/routerGuard.js";

const router = express.Router();

// Rotas públicas (qualquer pessoa pode ver produtos)
router.get("/",    getProducts);
router.get("/:id", getProductById);

// Rotas protegidas (somente staff pode criar/editar/deletar)
router.post(  "/",    routerGuard("staff"), createProduct);
router.put(   "/:id", routerGuard("staff"), updateProduct);
router.delete("/:id", routerGuard("staff"), deleteProduct);

export default router;
