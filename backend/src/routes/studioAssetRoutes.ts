import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { BadRequestProblem, ServiceUnavailableProblem, TooManyRequestsProblem } from "../errors/problem.js";
import { StudioImageProblem } from "../errors/studioImageProblem.js";
import { routerGuard } from "../middlewares/routerGuard.js";
import { deleteStudioAsset, listStudioAssets, readStudioAsset, saveStudioAsset } from "../services/studioAssets.js";
import { MAX_STUDIO_IMAGE_BYTES, STUDIO_IMAGE_MEDIA_TYPE } from "../services/studioImageCodec.js";
import { studioUploadSlots } from "../services/uploadSlots.js";
import { publicIdDoUsuario } from "../utils/identidade.js";

const parseFile = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fields: 0, parts: 2, fileSize: MAX_STUDIO_IMAGE_BYTES + 1 },
}).single("file");

function readFilePart(req: Request, res: Response) {
  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new BadRequestProblem("O envio não foi concluído."));
    }, 20_000);
    const onAborted = () => {
      clearTimeout(timer);
      reject(new BadRequestProblem("O envio não foi concluído."));
    };
    req.once("aborted", onAborted);
    parseFile(req, res, (error: unknown) => {
      clearTimeout(timer);
      req.off("aborted", onAborted);
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        reject(new StudioImageProblem("studio-image-size"));
      } else if (error || !req.file) {
        reject(new BadRequestProblem("Envie uma imagem no campo file."));
      } else {
        resolve(req.file.buffer);
      }
    });
  });
}

export function createStudioAssetRoutes(enableRateLimit: boolean) {
  const router = express.Router();
  router.use(routerGuard("client", "staff"));
  const uploadLimit = rateLimit({
    windowMs: 60_000,
    limit: 8,
    keyGenerator: publicIdDoUsuario,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequestsProblem("Aguarde antes de enviar outra imagem.")),
  });
  if (enableRateLimit) router.use(uploadOnly);

  function uploadOnly(req: Request, res: Response, next: express.NextFunction) {
    if (req.method === "POST") return uploadLimit(req, res, next);
    next();
  }

  router.post("/", async (req, res) => {
    const usuario = publicIdDoUsuario(req);
    const liberar = studioUploadSlots.reservar(usuario);
    if (!liberar) throw new ServiceUnavailableProblem("Envios em processamento. Tente novamente.");
    try {
      const data = await readFilePart(req, res);
      const asset = await saveStudioAsset(usuario, data);
      res.status(201).json({ asset });
    } finally {
      liberar();
    }
  });
  router.get("/", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ assets: await listStudioAssets(publicIdDoUsuario(req)) });
  });
  router.get("/:id/content", async (req, res) => {
    const data = await readStudioAsset(publicIdDoUsuario(req), req.params.id);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(STUDIO_IMAGE_MEDIA_TYPE).send(data);
  });
  router.delete("/:id", async (req, res) => {
    await deleteStudioAsset(publicIdDoUsuario(req), req.params.id);
    res.status(204).end();
  });
  return router;
}
