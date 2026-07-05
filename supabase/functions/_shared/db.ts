import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Client service-role (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados
// automaticamente no runtime das Edge Functions). Bypassa RLS.
export function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
