import sharp from "sharp";
import { StudioImageProblem } from "../errors/studioImageProblem.js";

export const MAX_STUDIO_IMAGE_BYTES = 5 * 1024 * 1024;
const maxSide = 4096;
export const STUDIO_IMAGE_MEDIA_TYPE = "image/webp";

function sourceFormat(input: Buffer) {
  if (input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (input[0] === 255 && input[1] === 216 && input[2] === 255) return "jpeg";
  if (input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP") return "webp";
  throw new StudioImageProblem("studio-image-format");
}

/** Some decoders read an animated PNG as a single frame. Reject it before decoding. */
function validatePngChunks(input: Buffer) {
  for (let offset = 8; offset + 12 <= input.length;) {
    const length = input.readUInt32BE(offset);
    const next = offset + 12 + length;
    if (next > input.length) break;
    const name = input.toString("ascii", offset + 4, offset + 8);
    if (name === "acTL" || name === "fcTL" || name === "fdAT") break;
    if (name === "IEND" && length === 0) return;
    offset = next;
  }
  throw new StudioImageProblem("studio-image-invalid");
}

export async function normalizeStudioImage(input: Buffer) {
  if (input.length > MAX_STUDIO_IMAGE_BYTES) throw new StudioImageProblem("studio-image-size");
  const format = sourceFormat(input);
  if (format === "png") validatePngChunks(input);

  try {
    const raster = sharp(input, { failOn: "warning", limitInputPixels: maxSide * maxSide, animated: true });
    const metadata = await raster.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1
        || metadata.width < 1 || metadata.width > maxSide
        || metadata.height < 1 || metadata.height > maxSide) {
      throw new StudioImageProblem("studio-image-invalid");
    }

    // Output drops metadata by default and preserves raster transparency.
    const { data, info } = await raster.autoOrient().webp({ quality: 88 }).timeout({ seconds: 5 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > MAX_STUDIO_IMAGE_BYTES) throw new StudioImageProblem("studio-image-size");
    return { data, width: info.width, height: info.height, bytes: data.length };
  } catch (error) {
    if (error instanceof StudioImageProblem) throw error;
    throw new StudioImageProblem("studio-image-invalid");
  }
}
