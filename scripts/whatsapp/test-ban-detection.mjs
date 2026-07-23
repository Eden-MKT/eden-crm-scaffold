// Teste de aceite — detecção de número banido/bloqueado (statusReason 403).
// Semeia um agente de teste (marker TEST_BANDETECT), simula eventos
// connection.update no evolution-webhook e valida o whatsapp-connect. Limpa tudo
// no finally. NÃO toca na Evolution real (o agente de teste tem instância fictícia
// e o whatsapp-connect responde "blocked" antes de consultar a Evolution).
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
const FN_BASE = `${env.VITE_SUPABASE_URL.replace(/\/$/, "")}/functions/v1`;
const WEBHOOK_TOKEN = env.EVOLUTION_WEBHOOK_TOKEN;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;

const INSTANCE = "eden_testbandetect";
const MARKER = "TEST_BANDETECT";

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (r.status >= 300) throw new Error(`SQL ${r.status}: ${t}`);
  return JSON.parse(t);
}

async function webhook(state, statusReason) {
  const r = await fetch(`${FN_BASE}/evolution-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-token": WEBHOOK_TOKEN },
    body: JSON.stringify({
      event: "connection.update",
      instance: INSTANCE,
      data: { state, statusReason },
    }),
  });
  return r.status;
}

async function connect(token) {
  const r = await fetch(`${FN_BASE}/whatsapp-connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ token }),
  });
  return { status: r.status, body: await r.json() };
}

const results = [];
const ok = (name, cond, extra = "") => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? "PASS" : "FALL"} — ${name}${extra ? "  :: " + extra : ""}`);
};

let agentId, token, clientId;
try {
  // Seed cliente + agente de teste (UNIQUE em client_id exige cliente próprio) + connect token
  const cli = await sql(`insert into public.clients (name) values ('${MARKER}') returning id`);
  clientId = cli[0].id;
  const seeded = await sql(
    `insert into public.whatsapp_agents (client_id, instance_name, status, niche)
     values ('${clientId}', '${INSTANCE}', 'disconnected', '${MARKER}')
     returning id`,
  );
  agentId = seeded[0].id;
  const tok = await sql(
    `insert into public.whatsapp_connect_tokens (agent_id, expires_at)
     values ('${agentId}', now() + interval '1 hour') returning token`,
  );
  token = tok[0].token;

  // a) close + 403 → connection_error preenchido
  const sa = await webhook("close", 403);
  const afterBan = (
    await sql(`select connection_error from public.whatsapp_agents where id='${agentId}'`)
  )[0];
  ok(
    "a. webhook close/403 marca banido",
    sa === 200 && !!afterBan.connection_error,
    afterBan.connection_error ?? "null",
  );

  // b) whatsapp-connect → blocked + mensagem
  const cb = await connect(token);
  ok(
    "b. whatsapp-connect responde blocked",
    cb.body.status === "blocked" && !!cb.body.message,
    JSON.stringify(cb.body),
  );

  // c) close + 401 (logout) NÃO marca banido (limpa antes p/ isolar)
  await sql(`update public.whatsapp_agents set connection_error=null where id='${agentId}'`);
  await webhook("close", 401);
  const after401 = (
    await sql(`select connection_error from public.whatsapp_agents where id='${agentId}'`)
  )[0];
  ok(
    "c. close/401 não marca banido",
    after401.connection_error === null,
    String(after401.connection_error),
  );

  // d) open limpa o aviso (seta banido, depois open)
  await webhook("close", 403);
  await webhook("open", 0);
  const afterOpen = (
    await sql(`select connection_error, status from public.whatsapp_agents where id='${agentId}'`)
  )[0];
  ok(
    "d. open limpa connection_error",
    afterOpen.connection_error === null && afterOpen.status === "connected",
    JSON.stringify(afterOpen),
  );
} finally {
  // Limpeza total
  if (agentId) {
    await sql(`delete from public.whatsapp_connect_tokens where agent_id='${agentId}'`).catch(
      () => {},
    );
    await sql(`delete from public.whatsapp_agents where id='${agentId}'`).catch(() => {});
  }
  await sql(`delete from public.whatsapp_agents where niche='${MARKER}'`).catch(() => {});
  if (clientId) await sql(`delete from public.clients where id='${clientId}'`).catch(() => {});
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
