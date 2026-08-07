// Human-in-the-loop: a IA pergunta no grupo da equipe e lê a resposta.
// - group_consults: perguntas pendentes/respondidas (correlação por mensagem citada).
// - whatsapp_agents.group_consult_topics: temas que sempre vão ao grupo.
// Idempotente. RLS deny-by-default (staff); edge usa service role.
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
  return r.status < 300;
}

const sql = `
create table if not exists public.group_consults (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.whatsapp_agents(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  remote_jid text not null,
  pergunta text not null,
  group_message_id text,
  status text not null default 'waiting' check (status in ('waiting','answered','expired')),
  resposta_equipe text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists group_consults_waiting_idx
  on public.group_consults (agent_id, status, created_at);
create index if not exists group_consults_msg_idx
  on public.group_consults (group_message_id) where group_message_id is not null;

alter table public.whatsapp_agents
  add column if not exists group_consult_topics jsonb not null default '[]'::jsonb;

alter table public.group_consults enable row level security;
drop policy if exists staff_all on public.group_consults;
create policy staff_all on public.group_consults
  for all using (public.is_staff()) with check (public.is_staff());
`;

await run("group_consults + topics", sql);
await run(
  "confirm",
  `select
    (select count(*) from information_schema.tables where table_schema='public' and table_name='group_consults') as tabela,
    (select count(*) from information_schema.columns where table_schema='public' and table_name='whatsapp_agents' and column_name='group_consult_topics') as coluna`,
);
