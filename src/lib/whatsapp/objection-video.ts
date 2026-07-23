import { supabase } from "@/integrations/supabase/client";
import {
  compressVideoForWhatsApp,
  SOURCE_VIDEO_MAX_BYTES,
  WHATSAPP_VIDEO_MAX_BYTES,
  type CompressProgress,
} from "@/lib/whatsapp/compress-video";

const BUCKET = "objection-videos";

export { WHATSAPP_VIDEO_MAX_BYTES, SOURCE_VIDEO_MAX_BYTES };
export type { CompressProgress };

// Normaliza o nome do arquivo (mesmo padrão de lib/clients/files.ts).
function sanitize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/** Gera slug interno (`tipo`) a partir do nome amigável da objeção. */
export function slugifyObjectionTipo(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export type UploadObjectionProgress =
  | { phase: "compressing"; ratio: number }
  | { phase: "uploading"; ratio: number };

/**
 * Comprime se necessário (alvo WhatsApp ≤16MB) e sobe para o Storage público.
 * Retorna a URL pública que a Evolution baixa ao enviar ao lead.
 */
export async function uploadObjectionVideo(
  agentId: string,
  file: File,
  onProgress?: (p: UploadObjectionProgress) => void,
): Promise<{ url: string; sizeBytes: number }> {
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|3gp)$/i.test(file.name)) {
    throw new Error("Envie um arquivo de vídeo (mp4, webm ou mov).");
  }
  if (file.size > SOURCE_VIDEO_MAX_BYTES) {
    throw new Error("Vídeo muito grande para processar (máx. 1GB). Comprima ou cole a URL.");
  }

  const ready = await compressVideoForWhatsApp(file, (p: CompressProgress) => {
    onProgress?.({
      phase: "compressing",
      ratio: p.phase === "loading" ? 0 : p.ratio,
    });
  });

  if (ready.size > WHATSAPP_VIDEO_MAX_BYTES) {
    throw new Error("Vídeo ainda acima de 16MB após compressão — o WhatsApp não entrega.");
  }

  onProgress?.({ phase: "uploading", ratio: 0 });
  const path = `${agentId}/${Date.now()}-${sanitize(ready.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, ready, {
    contentType: ready.type || "video/mp4",
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  onProgress?.({ phase: "uploading", ratio: 1 });

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { url, sizeBytes: ready.size };
}
