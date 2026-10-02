import express from "express";
import { createOrder, getOrders, updateOrderStatus, checkoutCart } from "../controllers/orderController.js";
import { routerGuard } from "../middlewares/routerGuard.js";
import { validateBody } from "../middlewares/validate.js";
import {
  createOrderSchema,
  checkoutCartSchema,
  updateOrderStatusSchema,
} from "../dtos/order/order.dto.js";

const router = express.Router();

router.use(routerGuard()); // Secure all order routes

router.post("/", validateBody(createOrderSchema), createOrder);
router.post("/checkout-cart", validateBody(checkoutCartSchema), checkoutCart);
router.get("/", getOrders);
router.put("/:publicId/status", validateBody(updateOrderStatusSchema), updateOrderStatus);

export default router;
