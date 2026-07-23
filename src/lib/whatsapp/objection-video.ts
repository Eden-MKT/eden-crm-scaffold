import { supabase } from "@/integrations/supabase/client";

const BUCKET = "objection-videos";
const MAX_BYTES = 100 * 1024 * 1024; // 100MB (limite também imposto no bucket)

// Normaliza o nome do arquivo (mesmo padrão de lib/clients/files.ts).
function sanitize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

/**
 * Sobe um vídeo de objeção para o Storage (bucket público) e retorna a URL
 * pública — é ela que a Evolution API baixa na hora de enviar ao lead.
 */
export async function uploadObjectionVideo(agentId: string, file: File): Promise<string> {
  if (!file.type.startsWith("video/")) {
    throw new Error("Envie um arquivo de vídeo (mp4, webm ou mov).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Vídeo muito grande — o limite é 100MB.");
  }
  const path = `${agentId}/${Date.now()}-${sanitize(file.name)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
