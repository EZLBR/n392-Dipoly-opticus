// ============================================================
//   AUTH ROUTES
//   Base: /api/auth
// ============================================================

import express from "express";
import {
  register,
  login,
  getMe,
  getUsers,
  updateUser,
  deleteUser
} from "../controllers/authController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// Rotas públicas
router.post("/register", register);
router.post("/login",    login);

// Rotas protegidas
router.get("/me",            protect,                       getMe);
router.get("/users",         protect, authorize("staff"),   getUsers);
router.put("/users/:id",     protect, authorize("staff"),   updateUser);
router.delete("/users/:id",  protect, authorize("staff"),   deleteUser);

export default router;
