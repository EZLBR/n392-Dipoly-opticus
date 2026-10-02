import express from "express";
import { saveDesign, getDesigns, deleteDesign } from "../controllers/designController.js";
import { routerGuard } from "../middlewares/routerGuard.js";
import { validateBody } from "../middlewares/validate.js";
import { saveDesignSchema } from "../dtos/design/design.dto.js";

const router = express.Router();

// All design routes are protected and require a logged-in client
router.use(routerGuard());

router.post("/", validateBody(saveDesignSchema), saveDesign);
router.get("/", getDesigns);
router.delete("/:id", deleteDesign);

export default router;
