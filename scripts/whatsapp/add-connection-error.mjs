// Adiciona a coluna whatsapp_agents.connection_error (nullable), usada para
// registrar o motivo do último bloqueio/banimento detectado no webhook de
// conexão (statusReason 403). Idempotente. Padrão dos apply-* do projeto.
import { existsSync, readFileSync } from "node:fs";

function loadEnv(p) {
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

const env = {
  ...loadEnv("e:/eden-crm-scaffold/.env"),
  ...loadEnv("e:/eden-crm-scaffold/.env.local"),
};
const ref = "glrvnlxclaehepewwcpa";

async function run(label, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  console.log(label, "->", r.status, t.slice(0, 400));
  return r.status < 300;
}

await run(
  "add connection_error",
  `alter table public.whatsapp_agents add column if not exists connection_error text;`,
);
await run(
  "confirm",
  `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='whatsapp_agents' and column_name='connection_error';`,
);
