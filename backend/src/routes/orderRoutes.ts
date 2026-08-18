import express from "express";
import { createOrder, getOrders, updateOrderStatus, checkoutCart } from "../controllers/orderController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect); // Secure all order routes

router.post("/", createOrder);
router.post("/checkout-cart", checkoutCart);
router.get("/", getOrders);
router.put("/:id/status", updateOrderStatus);

export default router;
