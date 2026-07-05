import { supabase } from "@/integrations/supabase/client";

const BUCKET = "whatsapp-media";

// URL assinada (1h) para exibir mídia privada do WhatsApp.
export async function getWhatsappMediaUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
