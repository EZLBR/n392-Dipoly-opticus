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
import { validateBody, validateQuery } from "../middlewares/validate.js";
import {
  createProductSchema,
  updateProductSchema,
  getProductsQuerySchema,
} from "../dtos/product/product.dto.js";

const router = express.Router();

// Rotas públicas (qualquer pessoa pode ver produtos)
router.get("/",    validateQuery(getProductsQuerySchema), getProducts);
router.get("/:id", getProductById);

// Rotas protegidas (somente staff pode criar/editar/deletar)
router.post(  "/",    routerGuard("staff"), validateBody(createProductSchema), createProduct);
router.put(   "/:id", routerGuard("staff"), validateBody(updateProductSchema), updateProduct);
router.delete("/:id", routerGuard("staff"), deleteProduct);

export default router;
