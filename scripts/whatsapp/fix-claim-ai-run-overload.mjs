// Correção: existiam DUAS versões de claim_ai_run — (uuid, text) e (uuid, uuid).
// O webhook chama db.rpc("claim_ai_run", {p_message_id: <string>}), o que ficava
// AMBÍGUO entre os dois overloads → a RPC retornava erro "Could not choose the
// best candidate function" → claimed=null → o pipeline da IA saía ANTES de gerar
// resposta. Resultado: a IA parou de responder em TODAS as conversas.
//
// last_inbound_message_id e whatsapp_messages.id são UUID, então a versão correta
// é (uuid, uuid) (que ainda checa ai_paused e janela de 90s). Removemos o overload
// (uuid, text) para acabar com a ambiguidade. Idempotente.
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

await run("drop overload (uuid,text)", "drop function if exists public.claim_ai_run(uuid, text);");
await run(
  "overloads restantes",
  "select oid::regprocedure as sig from pg_proc where proname='claim_ai_run'",
);
