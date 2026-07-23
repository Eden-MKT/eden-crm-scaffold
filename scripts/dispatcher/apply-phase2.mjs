// FASE 2 do Disparador WhatsApp — SQL de suporte ao worker de fila.
// Aplica via Supabase Management API (mesmo padrão de scripts/deploy-functions.mjs).
// Uso: node scripts/dispatcher/apply-phase2.mjs
import { existsSync, readFileSync } from "node:fs";
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

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const statements = [
  {
    name: "claim_dispatch_batch",
    sql: `
create or replace function public.claim_dispatch_batch(p_batch int)
returns setof public.dispatch_queue
language sql
security definer
set search_path = public
as $$
  update dispatch_queue
     set status = 'processando', locked_at = now()
   where id in (
     select id
       from dispatch_queue
      where status = 'pendente'
        and scheduled_at <= now()
      order by scheduled_at
      for update skip locked
      limit p_batch
   )
  returning *;
$$;
revoke execute on function public.claim_dispatch_batch(int) from public, anon, authenticated;
`,
  },
  {
    name: "reap_dispatch_locks",
    sql: `
create or replace function public.reap_dispatch_locks()
returns integer
language sql
security definer
set search_path = public
as $$
  with reaped as (
    update dispatch_queue
       set status = 'pendente', locked_at = null, tentativas = tentativas + 1
     where status = 'processando'
       and locked_at < now() - interval '5 minutes'
    returning 1
  )
  select count(*)::int from reaped;
$$;
revoke execute on function public.reap_dispatch_locks() from public, anon, authenticated;
`,
  },
  {
    // pg_cron não suporta granularidade de segundos: 1 job de 1 min é suficiente
    // para começar. Para densificar depois, agende jobs extras (ex.:
    // 'dispatch-worker-1min-b') com sleep inicial dentro da edge function, ou
    // aumente o batch do worker.
    name: "cron dispatch-worker-1min",
    sql: `
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'dispatch-worker-1min') then
    perform cron.unschedule('dispatch-worker-1min');
  end if;
end
$do$;
select cron.schedule(
  'dispatch-worker-1min',
  '* * * * *',
  $cron$select public.invoke_edge_function('dispatch-worker')$cron$
);
`,
  },
];

let ok = true;
for (const st of statements) {
  const r = await query(st.sql);
  console.log(`${st.name}: ${r.status} ${r.ok ? "OK" : r.text.slice(0, 300)}`);
  ok = ok && r.ok;
}
process.exit(ok ? 0 : 1);
