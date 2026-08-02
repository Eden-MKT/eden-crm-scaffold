// Colunas de idempotência para a agenda:
// - group_notified_at: trava o aviso ao grupo (envia 1x por agendamento).
// - booking_confirmed_at: trava a confirmação imediata ao paciente (envia 1x).
// Idempotente (add column if not exists).
import { existsSync, readFileSync } from "node:fs";

function le(p) {
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
const env = { ...le("e:/eden-crm-scaffold/.env"), ...le("e:/eden-crm-scaffold/.env.local") };
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
  console.log(label, "->", r.status, t.slice(0, 300));
}

await run(
  "add group_notified_at + booking_confirmed_at",
  `alter table public.appointments
     add column if not exists group_notified_at timestamptz,
     add column if not exists booking_confirmed_at timestamptz;`,
);
await run(
  "confirm",
  `select column_name from information_schema.columns where table_schema='public' and table_name='appointments' and column_name in ('group_notified_at','booking_confirmed_at') order by column_name;`,
);
