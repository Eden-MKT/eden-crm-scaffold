// Cliente Supabase compartilhado do app (browser).
//
// Segue a convenção do Lovable (src/integrations/supabase/client.ts) para que,
// caso o Supabase seja conectado nativamente pelo Lovable depois, não haja
// conflito de caminho/uso. As credenciais vêm de variáveis VITE_ — a
// publishable key é pública por design e o acesso aos dados é controlado por RLS.
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Supabase: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env");
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
