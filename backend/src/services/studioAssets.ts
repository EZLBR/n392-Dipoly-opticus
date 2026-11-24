import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { emTransacao } from "../config/transacao.js";
import { ServiceUnavailableProblem, UnauthorizedProblem } from "../errors/problem.js";
import { StudioImageProblem } from "../errors/studioImageProblem.js";
import type { SaveDesignDTO } from "../dtos/design/design.dto.js";
import { normalizeStudioImage, STUDIO_IMAGE_MEDIA_TYPE } from "./studioImageCodec.js";
import { usuarioPorPublicId } from "../utils/identidade.js";
import logger from "../utils/logger.js";

const assetIds = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maxAssets = 20;
const maxTotalBytes = 100 * 1024 * 1024;
interface Asset {
  id: string;
  width: number;
  height: number;
  bytes: number;
}

function directory() {
  return resolve(process.env.STUDIO_ASSET_DIR?.trim() || ".studio-assets");
}
function filePath(id: string) {
  if (!assetIds.test(id)) throw new StudioImageProblem("studio-image-not-found");
  return join(directory(), id + ".webp");
}
function withMediaType<T extends Asset>(asset: T) {
  return { ...asset, mediaType: STUDIO_IMAGE_MEDIA_TYPE };
}

export async function saveStudioAsset(user: string, input: Buffer) {
  const image = await normalizeStudioImage(input);
  const asset = { id: randomUUID(), width: image.width, height: image.height, bytes: image.bytes };
  await emTransacao(async client => {
    // Serializes quota reservations for this owner, including concurrent API requests.
    const { rows: [owner] } = await client.query<{ id: number }>(
      'SELECT id FROM usuarios WHERE "publicId" = $1 FOR NO KEY UPDATE', [user],
    );
    if (!owner) throw new UnauthorizedProblem("Sessão inválida.");
    const { rows: [quota] } = await client.query<{ count: number; bytes: number }>(
      'SELECT count(*)::int AS count, coalesce(sum(bytes), 0)::int AS bytes FROM studio_assets WHERE usuario_id = $1',
      [owner.id],
    );
    if (quota.count >= maxAssets || quota.bytes + asset.bytes > maxTotalBytes) {
      throw new StudioImageProblem("studio-image-quota");
    }
    await client.query(
      'INSERT INTO studio_assets (id, usuario_id, width, height, bytes) VALUES ($1, $2, $3, $4, $5)',
      [asset.id, owner.id, asset.width, asset.height, asset.bytes],
    );
  });

  try {
    const path = filePath(asset.id);
    await emTransacao(async client => {
      const reserved = await client.query(
        "SELECT id FROM studio_assets WHERE id = $1 AND state = 'pending' AND usuario_id IS NOT NULL FOR UPDATE",
        [asset.id],
      );
      if (!reserved.rowCount) throw new UnauthorizedProblem("Sessão inválida.");
      await mkdir(directory(), { recursive: true, mode: 0o700 });
      await writeFile(path, image.data, { flag: "wx", mode: 0o600, flush: true });
      await client.query("UPDATE studio_assets SET state = 'ready' WHERE id = $1", [asset.id]);
    });
  } catch (error) {
    // A commit whose result was lost may have succeeded. Only cancel a still-pending row.
    await pool.query("UPDATE studio_assets SET state = 'deleting' WHERE id = $1 AND state = 'pending'", [asset.id])
      .then(() => purgeStudioAsset(asset.id)).catch(() => logger.warn("Limpeza de imagem do Studio pendente."));
    if (error instanceof UnauthorizedProblem) throw error;
    throw new ServiceUnavailableProblem("Não foi possível armazenar a imagem.");
  }
  return withMediaType(asset);
}

export async function listStudioAssets(user: string) {
  const { rows } = await pool.query<Asset & { inUse: boolean }>(
    `SELECT id, width, height, bytes,
      EXISTS (SELECT 1 FROM studio_design_assets r WHERE r.asset_id = a.id) AS "inUse"
      FROM studio_assets a WHERE a.usuario_id = ${usuarioPorPublicId("$1")}
      AND a.state = 'ready' ORDER BY created_at DESC, id`, [user],
  );
  return rows.map(withMediaType);
}

export async function readStudioAsset(user: string, id: string) {
  const path = filePath(id);
  const { rowCount } = await pool.query(
    `SELECT id FROM studio_assets WHERE id = $1 AND usuario_id = ${usuarioPorPublicId("$2")} AND state = 'ready'`,
    [id, user],
  );
  if (!rowCount) throw new StudioImageProblem("studio-image-not-found");
  try {
    return await readFile(path);
  } catch {
    throw new ServiceUnavailableProblem("O arquivo da imagem está indisponível.");
  }
}

export async function deleteStudioAsset(user: string, id: string) {
  filePath(id);
  await emTransacao(async client => {
    const { rowCount } = await client.query(
      `SELECT id FROM studio_assets WHERE id = $1 AND usuario_id = ${usuarioPorPublicId("$2")}
       AND state IN ('ready', 'deleting') FOR UPDATE`, [id, user],
    );
    if (!rowCount) throw new StudioImageProblem("studio-image-not-found");
    const reference = await client.query("SELECT 1 FROM studio_design_assets WHERE asset_id = $1 LIMIT 1", [id]);
    if (reference.rowCount) throw new StudioImageProblem("studio-image-in-use");
    await client.query("UPDATE studio_assets SET state = 'deleting' WHERE id = $1", [id]);
  });
  await purgeStudioAsset(id).catch(() => {
    throw new ServiceUnavailableProblem("A imagem foi desativada e a limpeza será tentada novamente.");
  });
}

async function purgeStudioAsset(id: string) {
  await emTransacao(async client => {
    const { rowCount } = await client.query(
      "SELECT id FROM studio_assets WHERE id = $1 AND state = 'deleting' FOR UPDATE", [id],
    );
    if (!rowCount) return;
    try {
      await unlink(filePath(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await client.query("DELETE FROM studio_assets WHERE id = $1", [id]);
  });
}

/** Retry disk cleanup and recover uploads interrupted before being marked ready. */
export async function cleanupStudioAssets() {
  const { rows } = await pool.query<{ id: string }>(
    `WITH candidates AS (
       SELECT id FROM studio_assets
        WHERE state = 'deleting' OR usuario_id IS NULL
           OR (state = 'pending' AND created_at < NOW() - INTERVAL '1 hour')
        ORDER BY created_at, id LIMIT 50 FOR UPDATE SKIP LOCKED
     )
     UPDATE studio_assets SET state = 'deleting'
       WHERE id IN (SELECT id FROM candidates) RETURNING id`,
  );
  for (const { id } of rows) {
    await purgeStudioAsset(id).catch(() => logger.warn("Limpeza de imagem do Studio pendente."));
  }
}

export async function syncDesignAssets(
  client: PoolClient, owner: string, designId: string, config: SaveDesignDTO["config"],
) {
  const layers = config?.artwork.version === 3
    ? config.artwork.layers.filter(layer => "kind" in layer && layer.kind === "image") : [];
  const ids = [...new Set(layers.map(layer => layer.assetId))];
  if (ids.length) {
    // The same row lock is used by deletion. A save either pins every asset or rolls back.
    const { rows } = await client.query<Asset>(
      `SELECT id, width, height, bytes FROM studio_assets
       WHERE id = ANY($1::uuid[]) AND usuario_id = ${usuarioPorPublicId("$2")}
         AND state = 'ready' ORDER BY id FOR UPDATE`, [ids, owner],
    );
    if (rows.length !== ids.length) throw new StudioImageProblem("studio-image-not-found");
    const dimensions = new Map(rows.map(asset => [asset.id, asset]));
    for (const layer of layers) {
      const asset = dimensions.get(layer.assetId)!;
      if (layer.crop.width * asset.width < 1 - 1e-9 || layer.crop.height * asset.height < 1 - 1e-9) {
        throw new StudioImageProblem("studio-image-crop");
      }
    }
  }
  await client.query("DELETE FROM studio_design_assets WHERE design_id = $1 AND NOT (asset_id = ANY($2::uuid[]))", [designId, ids]);
  if (ids.length) {
    await client.query(
      `INSERT INTO studio_design_assets (design_id, asset_id)
       SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [designId, ids],
    );
  }
}
