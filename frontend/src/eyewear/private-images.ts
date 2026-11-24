import { useEffect, useState } from "react";
import { apiClient, apiFetch, parseProblemDetails, ProblemError, resolveUrl } from "../api/client";
import { localizeProblem, translate, type Language } from "../contexts/LanguageContext";

const endpoint = "/studio/assets";
export const studioImageTypes = "image/png,image/jpeg,image/webp";
export const maxStudioImageBytes = 5 * 1024 * 1024;

export interface StudioImageAsset {
  id: string;
  width: number;
  height: number;
  bytes: number;
  mediaType: string;
  inUse?: boolean;
}
const auth = (token: string, signal?: AbortSignal) => ({
  headers: { Authorization: `Bearer ${token}` }, signal,
});
export const isCurrentImageSession = (token: string) => localStorage.getItem("opticus_token") === token;

export async function uploadStudioImage(file: File, token: string, signal: AbortSignal) {
  const form = new FormData();
  form.append("file", file);
  const { asset } = await apiClient.post<{ asset: StudioImageAsset }>(endpoint, form, auth(token, signal));
  return asset;
}
export async function listStudioImages(token: string, signal: AbortSignal) {
  const { assets } = await apiClient.get<{ assets: StudioImageAsset[] }>(endpoint, auth(token, signal));
  return assets;
}
export function deleteStudioImage(id: string, token: string, signal: AbortSignal) {
  return apiClient.delete<void>(`${endpoint}/${encodeURIComponent(id)}`, auth(token, signal));
}

export function studioImageError(error: unknown, language?: Language) {
  if (error instanceof ProblemError) {
    const key = error.type?.match(/^https:\/\/opticus\.example\/problems\/(studio-image-[a-z-]+)$/)?.[1];
    return key ? translate(key, language) : localizeProblem(error.problem, language);
  }
  return translate("studio-image-unavailable", language);
}

function decodeImage(url: string, signal: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = document.createElement("img");
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      image.removeAttribute("src");
      reject(signal.reason);
    };
    if (signal.aborted) { abort(); return; }
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error("Image is unavailable.")); };
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}

interface ImageLease {
  promise: Promise<HTMLImageElement>;
  release: () => void;
}
interface ActiveImage {
  refs: number;
  controller: AbortController;
  promise: Promise<HTMLImageElement>;
  url?: string;
  image?: HTMLImageElement;
}

// Shared only while mounted, and only by consumers of the same authenticated session.
const activeImages = new Map<string, Map<string, ActiveImage>>();
async function loadPrivateImage(id: string, token: string, entry: ActiveImage) {
  const signal = entry.controller.signal;
  signal.throwIfAborted();
  if (!isCurrentImageSession(token)) throw new Error("The image session changed.");
  const response = await apiFetch(resolveUrl(`${endpoint}/${encodeURIComponent(id)}/content`), auth(token, signal));
  if (!response.ok) throw new ProblemError(await parseProblemDetails(response));
  const blob = await response.blob();
  signal.throwIfAborted();
  if (!isCurrentImageSession(token)) throw new Error("The image session changed.");
  entry.url = URL.createObjectURL(blob);
  entry.image = await decodeImage(entry.url, signal);
  return entry.image;
}
function acquireImage(id: string, token: string): ImageLease {
  let group = activeImages.get(token);
  if (!group) {
    group = new Map();
    activeImages.set(token, group);
  }
  const cache = group;
  let entry = cache.get(id);
  if (!entry) {
    const controller = new AbortController();
    const created: ActiveImage = {
      refs: 0, controller,
      promise: Promise.resolve().then(() => loadPrivateImage(id, token, created)).catch(error => {
        if (cache.get(id) === created) cache.delete(id);
        throw error;
      }),
    };
    cache.set(id, created);
    entry = created;
  }
  const retained = entry;
  retained.refs++;
  return { promise: retained.promise, release() {
    retained.refs--;
    if (retained.refs !== 0) return;
    retained.controller.abort();
    retained.image?.removeAttribute("src");
    if (retained.url) URL.revokeObjectURL(retained.url);
    if (cache.get(id) === retained) cache.delete(id);
    if (!cache.size && activeImages.get(token) === cache) activeImages.delete(token);
  } };
}

interface ImageSnapshot {
  key: string;
  token: string;
  attempt: number;
  images: ReadonlyMap<string, HTMLImageElement>;
  failed: ReadonlySet<string>;
}
const emptyImages = new Map<string, HTMLImageElement>();
const emptyFailures = new Set<string>();
const emptySnapshot = { images: emptyImages, failed: emptyFailures };

export function useStudioImages(ids: readonly string[], token: string | undefined, attempt = 0) {
  const key = ids.join(",");
  const [snapshot, setSnapshot] = useState<ImageSnapshot>();
  useEffect(() => {
    setSnapshot(undefined);
    if (!token || !key || !isCurrentImageSession(token)) return;
    let active = true;
    const identity = { key, token, attempt };
    const entries = key.split(",").map(id => ({ id, ...acquireImage(id, token) }));
    for (const { id, promise } of entries) {
      const settle = (image?: HTMLImageElement) => {
        if (!active || !isCurrentImageSession(token)) return;
        setSnapshot(current => {
          const matching = current?.key === key && current.token === token && current.attempt === attempt;
          const images = new Map(matching ? current.images : undefined);
          const failed = new Set(matching ? current.failed : undefined);
          if (image) images.set(id, image);
          else failed.add(id);
          return { ...identity, images, failed };
        });
      };
      void promise.then(settle, () => settle());
    }
    return () => {
      active = false;
      entries.forEach(entry => entry.release());
    };
  }, [key, token, attempt]);
  return snapshot && snapshot.key === key && snapshot.token === token && snapshot.attempt === attempt
    && token && isCurrentImageSession(token) ? snapshot : emptySnapshot;
}
