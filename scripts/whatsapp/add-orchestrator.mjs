// IA orquestrada (3 papéis em cadeia). Colunas de suporte. Idempotente.
// - whatsapp_agents.orchestrator_enabled: liga a cadeia (classificador→vendedor→
//   orquestrador/crítico) por agente. Default FALSE = comportamento atual intacto.
// - whatsapp_agents.sales_model: modelo do agente de argumentação (vendedor).
//   Fallback: agent.model → gpt-4o. Auxiliares (classificador/crítico) sempre no mini.
// - whatsapp_usage.latency_ms: latência por chamada (classify/critic/chat) p/ monitorar.
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
  console.log(label, "->", r.status, t.slice(0, 200));
  return r.status < 300;
}

await run(
  "orchestrator_enabled",
  `alter table public.whatsapp_agents add column if not exists orchestrator_enabled boolean not null default false`,
);
await run(
  "sales_model",
  `alter table public.whatsapp_agents add column if not exists sales_model text`,
);
await run(
  "usage.latency_ms",
  `alter table public.whatsapp_usage add column if not exists latency_ms integer`,
);
await run(
  "confirm",
  `select
    (select count(*) from information_schema.columns where table_schema='public' and table_name='whatsapp_agents' and column_name='orchestrator_enabled') as orch,
    (select count(*) from information_schema.columns where table_schema='public' and table_name='whatsapp_agents' and column_name='sales_model') as sales,
    (select count(*) from information_schema.columns where table_schema='public' and table_name='whatsapp_usage' and column_name='latency_ms') as lat`,
);
