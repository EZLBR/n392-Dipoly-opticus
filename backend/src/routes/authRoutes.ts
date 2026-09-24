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
import { routerGuard } from "../middlewares/routerGuard.js";

const router = express.Router();

// Rotas públicas
router.post("/register", register);
router.post("/login",    login);

// Rotas protegidas
router.get("/me",            routerGuard(),        getMe);
router.get("/users",         routerGuard("staff"), getUsers);
router.put("/users/:id",     routerGuard("staff"), updateUser);
router.delete("/users/:id",  routerGuard("staff"), deleteUser);


export default router;
