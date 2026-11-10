import express from "express";
import { createDesign, updateDesign, getDesigns, deleteDesign } from "../controllers/designController.js";
import { routerGuard } from "../middlewares/routerGuard.js";
import { validateBody } from "../middlewares/validate.js";
import { createDesignSchema, saveDesignSchema } from "../dtos/design/design.dto.js";

const router = express.Router();

// All design routes are protected and require a logged-in client
router.use(routerGuard());

// BOLA-04: criar e atualizar são rotas separadas. O POST só cria, com id
// gerado pelo servidor; o PUT só altera um design do próprio usuário.
router.post("/", validateBody(createDesignSchema), createDesign);
router.put("/:id", validateBody(saveDesignSchema), updateDesign);
router.get("/", getDesigns);
router.delete("/:id", deleteDesign);

export default router;
