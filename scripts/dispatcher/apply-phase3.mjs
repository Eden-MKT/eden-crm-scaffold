// FASE 3 do Disparador WhatsApp — secrets do webhook da Cloud API.
// Gera WA_VERIFY_TOKEN e WA_APP_SECRET (aleatórios), configura como secrets das
// Edge Functions via Management API e persiste em .env.local (para tooling e
// para o test-phase3 assinar payloads). Idempotente: se já existem no
// .env.local, reusa os valores (e re-envia à Management API).
// WA_CLOUD_TOKEN fica de fora — configurar quando houver conta Meta.
// Uso: node scripts/dispatcher/apply-phase3.mjs
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
const REF = "glrvnlxclaehepewwcpa";

const toAppend = [];
function ensure(name, generate) {
  if (env[name]) return env[name];
  const value = generate();
  toAppend.push(`${name}=${value}`);
  return value;
}

const verifyToken = ensure("WA_VERIFY_TOKEN", () => randomBytes(24).toString("hex"));
const appSecret = ensure("WA_APP_SECRET", () => randomBytes(32).toString("hex"));

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify([
    { name: "WA_VERIFY_TOKEN", value: verifyToken },
    { name: "WA_APP_SECRET", value: appSecret },
  ]),
});
console.log(`secrets: ${res.status} ${(await res.text()).slice(0, 200)}`);
if (!res.ok) process.exit(1);

if (toAppend.length) {
  appendFileSync(
    join(root, ".env.local"),
    `\n# FASE 3 disparador — webhook Cloud API (usados na config do app na Meta)\n${toAppend.join("\n")}\n`,
  );
  console.log(`gravados em .env.local: ${toAppend.map((l) => l.split("=")[0]).join(", ")}`);
}

console.log(`WA_VERIFY_TOKEN=${verifyToken}`);
console.log(`WA_APP_SECRET=${appSecret}`);
