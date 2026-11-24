// API identifiers are opaque strings. Reject legacy decimal IDs and unsafe
// path segments before they can be reused from a URL or browser storage.
export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z\d_-]{1,64}$/i.test(value) && !/^\d+$/.test(value);
}
