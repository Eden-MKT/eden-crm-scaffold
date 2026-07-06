// Helpers compartilhados pelas funções do portal.
// deno-lint-ignore no-explicit-any
type DB = any;

// Valida o JWT e retorna o usuário se ele for STAFF (email em staff_users).
export async function requireStaff(db: DB, req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token ?? "");
  if (error || !user?.email) return null;
  const { data } = await db
    .from("staff_users")
    .select("email")
    .ilike("email", user.email)
    .maybeSingle();
  return data ? user : null;
}

// Valida o JWT e retorna { user, clientId } se for um usuário-portal mapeado.
export async function requirePortalClient(db: DB, req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token ?? "");
  if (error || !user) return null;
  const { data } = await db
    .from("client_portal_users")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return { user, clientId: data.client_id as string };
}

// Senha forte legível (sem caracteres ambíguos).
export function generatePassword(len = 12): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
