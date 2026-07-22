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

// Valida o JWT e retorna o usuário se ele for MARKEI (donos, em markei_users).
export async function requireMarkei(db: DB, req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token ?? "");
  if (error || !user) return null;
  const { data } = await db
    .from("markei_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return data ? user : null;
}

// Staff OU markei — para ações compartilhadas (ex.: enviar mensagem manual).
export async function requireStaffOrMarkei(
  db: DB,
  req: Request,
): Promise<{ user: unknown; role: "staff" | "markei" } | null> {
  const staff = await requireStaff(db, req);
  if (staff) return { user: staff, role: "staff" };
  const markei = await requireMarkei(db, req);
  if (markei) return { user: markei, role: "markei" };
  return null;
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

// Valida chamadas agendadas (pg_cron → edge function) pelo header x-cron-token.
export function requireCron(req: Request): boolean {
  const provided = req.headers.get("x-cron-token") ?? "";
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  if (!expected || provided.length !== expected.length) return false;
  let out = 0;
  for (let i = 0; i < provided.length; i++) {
    out |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return out === 0;
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
