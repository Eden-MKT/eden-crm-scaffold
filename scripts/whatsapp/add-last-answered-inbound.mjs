// Auto-heal do pipeline de IA: ponteiro da última mensagem inbound JÁ respondida.
// Sem ele, um burst de mensagens/áudios escalonados podia deixar a última pergunta
// do cliente sem resposta (o run mais antigo ganhava o claim e respondia só parte).
// runPipeline (evolution-webhook) usa esta coluna para: (a) guarda anti-resposta
// -dupla após o claim, e (b) decidir no finally se a última inbound ficou órfã e
// precisa de outro run. Idempotente.
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

await run(
  "add last_answered_inbound_message_id",
  `alter table public.whatsapp_conversations
     add column if not exists last_answered_inbound_message_id uuid`,
);
await run(
  "confirm",
  `select count(*) as coluna from information_schema.columns
    where table_schema='public' and table_name='whatsapp_conversations'
      and column_name='last_answered_inbound_message_id'`,
);
