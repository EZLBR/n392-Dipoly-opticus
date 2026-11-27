import express from "express";
import {
  addCartItem,
  checkoutAccountCart,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from "../controllers/cartController.js";
import { routerGuard } from "../middlewares/routerGuard.js";
import { validateBody } from "../middlewares/validate.js";
import { addCartItemSchema, checkoutCartSnapshotSchema, updateCartItemSchema } from "../dtos/cart/cart.dto.js";

const router = express.Router();

// CART-01: o carrinho é de quem compra no Studio (cliente e staff, como a
// rota /cart do frontend). O dono é sempre o do token.
router.use(routerGuard("client", "staff"));

router.get("/", getCart);
router.delete("/", clearCart);
router.post("/items", validateBody(addCartItemSchema), addCartItem);
router.patch("/items/:publicId", validateBody(updateCartItemSchema), updateCartItem);
router.delete("/items/:publicId", removeCartItem);
router.post("/checkout", validateBody(checkoutCartSnapshotSchema), checkoutAccountCart);

export default router;
