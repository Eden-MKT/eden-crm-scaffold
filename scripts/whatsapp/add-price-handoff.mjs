// Transferir p/ secretária no momento do preço (específico do Dr. Rafael).
// Quando o paciente pergunta o valor, a IA avisa o grupo e pausa (secretária
// converte). Coluna por agente; ligada só pro Rafael. Idempotente.
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
const RAFAEL = "45b6f921-adde-4249-a35f-a345f3e7b629";

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
  console.log(label, "->", r.status, t.slice(0, 200));
  return r.status < 300;
}

await run(
  "add price_handoff_enabled",
  `alter table public.whatsapp_agents add column if not exists price_handoff_enabled boolean not null default false`,
);
await run(
  "liga p/ Rafael",
  `update public.whatsapp_agents set price_handoff_enabled=true where id='${RAFAEL}'`,
);
await run(
  "confirm",
  `select id, responsible_name, price_handoff_enabled, coalesce(agenda_notify_group_jid,'(sem grupo)') as grupo
     from public.whatsapp_agents where price_handoff_enabled=true`,
);
