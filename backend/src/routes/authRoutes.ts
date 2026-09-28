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
import { validateBody, validateQuery } from "../middlewares/validate.js";
import {
  registerSchema,
  loginSchema,
  updateUserSchema,
  getUsersQuerySchema,
} from "../dtos/auth/index.js";

const router = express.Router();

// Rotas públicas
router.post("/register", validateBody(registerSchema), register);
router.post("/login",    validateBody(loginSchema),    login);

// Rotas protegidas
router.get("/me",            routerGuard(),                                                 getMe);
router.get("/users",         routerGuard("staff"), validateQuery(getUsersQuerySchema),      getUsers);
router.put("/users/:id",     routerGuard("staff"), validateBody(updateUserSchema),          updateUser);
router.delete("/users/:id",  routerGuard("staff"),                                          deleteUser);

export default router;
