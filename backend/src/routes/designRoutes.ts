import express from "express";
import { saveDesign, getDesigns, deleteDesign } from "../controllers/designController.js";
import { routerGuard } from "../middlewares/routerGuard.js";

const router = express.Router();

// All design routes are protected and require a logged-in client
router.use(routerGuard());

router.post("/", saveDesign);
router.get("/", getDesigns);
router.delete("/:id", deleteDesign);

export default router;
