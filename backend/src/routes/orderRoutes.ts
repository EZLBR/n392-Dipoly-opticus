import express from "express";
import { createOrder, getOrders, updateOrderStatus, checkoutCart } from "../controllers/orderController.js";
import { routerGuard } from "../middlewares/routerGuard.js";

const router = express.Router();

router.use(routerGuard()); // Secure all order routes

router.post("/", createOrder);
router.post("/checkout-cart", checkoutCart);
router.get("/", getOrders);
router.put("/:publicId/status", updateOrderStatus);

export default router;
