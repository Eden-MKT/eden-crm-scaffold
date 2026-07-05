import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

export const MEDIA_BUCKET = "whatsapp-media";

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

// deno-lint-ignore no-explicit-any
export async function uploadMedia(
  admin: any,
  path: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  const { error } = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
}

// Extrai texto de PDF (cap ~5MB / 10 páginas por causa do limite de CPU de 2s).
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length > 5_000_000) return null;
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text).slice(0, 8000);
  } catch {
    return null;
  }
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "application/pdf": "pdf",
  };
  return map[mime] ?? "bin";
}
