// Deploy das Edge Functions via Supabase Management API (multipart).
// Uso: node scripts/deploy-functions.mjs [slug1 slug2 ...]  (default: todas)
// Requer SUPABASE_ACCESS_TOKEN no .env.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Lê .env e sobrepõe .env.local (segredos de servidor ficam só no .local).
function loadEnv(file) {
  const path = join(root, file);
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}
const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
const FUNCTIONS_DIR = join(root, "supabase", "functions");

// verify_jwt false em todas (validação é feita dentro de cada função).
const FUNCTIONS = [
  "evolution-webhook",
  "evolution-manager",
  "whatsapp-connect",
  "portal-metrics",
  "portal-manager",
  "portal-chat",
  "portal-agenda",
  "improve-prompt",
];

const sharedDir = join(FUNCTIONS_DIR, "_shared");
const sharedFiles = readdirSync(sharedDir).map((f) => ({
  path: `_shared/${f}`,
  content: readFileSync(join(sharedDir, f), "utf8"),
}));

async function deploy(slug) {
  const form = new FormData();
  form.append(
    "metadata",
    new Blob(
      [
        JSON.stringify({
          name: slug,
          entrypoint_path: `${slug}/index.ts`,
          verify_jwt: false,
        }),
      ],
      { type: "application/json" },
    ),
  );

  const indexContent = readFileSync(join(FUNCTIONS_DIR, slug, "index.ts"), "utf8");
  form.append(
    "file",
    new Blob([indexContent], { type: "application/typescript" }),
    `${slug}/index.ts`,
  );
  for (const f of sharedFiles) {
    form.append("file", new Blob([f.content], { type: "application/typescript" }), f.path);
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${slug}`,
    { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: form },
  );
  const text = await res.text();
  console.log(`${slug}: ${res.status} ${text.slice(0, 200)}`);
  return res.ok;
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : FUNCTIONS;
let ok = true;
for (const slug of targets) {
  ok = (await deploy(slug)) && ok;
}
process.exit(ok ? 0 : 1);
