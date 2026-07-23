// FASE 3 do Disparador — testes de aceite do wa-cloud-webhook + opt-out.
// Roda contra o banco real (Management API) + edge function deployada.
// Requer WA_VERIFY_TOKEN e WA_APP_SECRET no .env.local (apply-phase3.mjs).
// Uso: node scripts/dispatcher/test-phase3.mjs
//
// Testes:
//  a. GET verify: token certo → 200 + echo do challenge; errado → 403.
//  b. POST: sem assinatura → 401; assinatura errada → 401; certa → 200 e
//     status delivered gravado em wa_message_log (delivered_at).
//  c. Reentrega do mesmo POST → 200 sem efeito duplicado (1 webhook_event).
//  d. Queda de qualidade (YELLOW) → conta pausada + campanha rodando → pausada.
//  e. Inbound "PARAR" → suppression + opt_in=false + fila suprimida (contatado
//     segue false); inbound "oi tudo bem" → contatado=true + session_window.
// Todos os seeds são removidos ao final (marker TEST_PHASE3).
import { createHmac } from "node:crypto";
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
const FN = `https://${REF}.supabase.co/functions/v1/wa-cloud-webhook`;
const VERIFY_TOKEN = env.WA_VERIFY_TOKEN;
const APP_SECRET = env.WA_APP_SECRET;
if (!VERIFY_TOKEN || !APP_SECRET) {
  throw new Error("WA_VERIFY_TOKEN/WA_APP_SECRET ausentes — rode apply-phase3.mjs antes");
}

const MARKER = "TEST_PHASE3";
const PNID = "TESTP3_PNID";
const PHONE1 = "+5500888000001";
const PHONE2 = "+5500888000002";
const WAMID_OUT = "wamid.TESTP3.OUT1";

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`query ${res.status}: ${text.slice(0, 400)} — SQL: ${sql.slice(0, 120)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function sign(raw, secret = APP_SECRET) {
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}

async function post(body, { signature } = {}) {
  const raw = JSON.stringify(body);
  const headers = { "Content-Type": "application/json" };
  const sig = signature === undefined ? sign(raw) : signature;
  if (sig !== null) headers["X-Hub-Signature-256"] = sig;
  const res = await fetch(FN, { method: "POST", headers, body: raw });
  return { status: res.status, text: await res.text() };
}

// O processamento roda em background (waitUntil) — poll até a condição valer.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs = 15_000, intervalMs = 1_000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(intervalMs);
  }
}

function statusesBody(status) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "TESTP3_WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PNID, display_phone_number: "550088800000" },
              statuses: [
                {
                  id: WAMID_OUT,
                  status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: PHONE1.replace("+", ""),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function inboundBody(from, wamid, text) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "TESTP3_WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PNID, display_phone_number: "550088800000" },
              contacts: [{ wa_id: from }],
              messages: [
                {
                  from,
                  id: wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function cleanup() {
  await query(`
delete from webhook_events where event_key like 'wamid.TESTP3%' or event_key like '${PNID}%';
delete from dispatch_queue where campaign_id in (select id from campaigns where nome = '${MARKER}');
delete from wa_message_log where wamid like 'wamid.TESTP3%';
delete from session_windows where contact_id in (select id from dispatch_contacts where origem = '${MARKER}');
delete from suppression_list where telefone like '+5500888%';
delete from campaigns where nome = '${MARKER}';
delete from dispatch_contacts where origem = '${MARKER}';
delete from wa_accounts where phone_number_id = '${PNID}';`);
}

try {
  await cleanup(); // estado limpo se rodada anterior abortou

  // Seeds: conta cloud + campanha rodando + 2 contatos + 1 item pendente na
  // fila (scheduled_at no futuro — o worker de 1 min não pode reivindicá-lo)
  // + 1 log outbound com wamid conhecido.
  await query(`
with acc as (
  insert into wa_accounts (provider, phone_number_id, status, quality_tier, messaging_limit)
  values ('cloud', '${PNID}', 'ativa', 'GREEN', 'TIER_250')
  returning id
), camp as (
  insert into campaigns (nome, wa_account_id, status, janela_hora_inicio, janela_hora_fim, cap_diario, cooldown_dias, corpo_livre)
  select '${MARKER}', acc.id, 'rodando', 0, 23, 100, 0, 'Olá {{nome}}' from acc
  returning id, wa_account_id
), c as (
  insert into dispatch_contacts (telefone, nome, opt_in, contatado, origem)
  values ('${PHONE1}', 'OptOut', true, false, '${MARKER}'),
         ('${PHONE2}', 'Responde', true, false, '${MARKER}')
  returning id, telefone
), q as (
  insert into dispatch_queue (campaign_id, contact_id, status, scheduled_at)
  select camp.id, c.id, 'pendente', now() + interval '1 hour' from camp, c
  where c.telefone = '${PHONE1}'
  returning id
), lg as (
  insert into wa_message_log (wamid, campaign_id, contact_id, wa_account_id, direcao, status, sent_at)
  select '${WAMID_OUT}', camp.id, c.id, camp.wa_account_id, 'outbound', 'sent', now()
  from camp, c where c.telefone = '${PHONE1}'
  returning id
)
select (select count(*) from q) as queued, (select count(*) from lg) as logged;`);

  // ---------------------------------------------------------------- Teste a
  console.log("\n[a] GET verify");
  const okRes = await fetch(
    `${FN}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}&hub.challenge=ping-12345`,
  );
  const okBody = await okRes.text();
  check("token certo → 200 + echo do challenge", okRes.status === 200 && okBody === "ping-12345");
  const badRes = await fetch(`${FN}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=x`);
  check("token errado → 403", badRes.status === 403, `HTTP ${badRes.status}`);

  // ---------------------------------------------------------------- Teste b
  console.log("\n[b] POST assinado (status delivered)");
  const body = statusesBody("delivered");
  const noSig = await post(body, { signature: null });
  check("sem assinatura → 401", noSig.status === 401, `HTTP ${noSig.status}`);
  const wrongSig = await post(body, { signature: sign(JSON.stringify(body), "segredo-errado") });
  check("assinatura errada → 401", wrongSig.status === 401, `HTTP ${wrongSig.status}`);
  const goodSig = await post(body);
  check("assinatura certa → 200", goodSig.status === 200, `HTTP ${goodSig.status}`);
  const delivered = await until(async () => {
    const [row] = await query(
      `select status, delivered_at from wa_message_log where wamid = '${WAMID_OUT}'`,
    );
    return row?.delivered_at ? row : null;
  });
  check(
    "wa_message_log: status=delivered + delivered_at preenchido",
    delivered?.status === "delivered" && !!delivered?.delivered_at,
    JSON.stringify(delivered),
  );

  // ---------------------------------------------------------------- Teste c
  console.log("\n[c] reentrega (idempotência por event_key)");
  const again = await post(body);
  check("mesmo POST de novo → 200", again.status === 200, `HTTP ${again.status}`);
  await sleep(4000); // dá tempo do background da reentrega rodar
  const [evCount] = await query(
    `select count(*)::int as n from webhook_events where event_key = '${WAMID_OUT}:status:delivered'`,
  );
  check("webhook_events tem exatamente 1 registro do event_key", Number(evCount?.n) === 1);

  // ---------------------------------------------------------------- Teste d
  console.log("\n[d] queda de qualidade (YELLOW)");
  const qual = await post({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "TESTP3_WABA",
        changes: [
          {
            field: "phone_number_quality_update",
            value: {
              event: "PHONE_NUMBER_QUALITY_UPDATE",
              phone_number_id: PNID,
              display_phone_number: "550088800000",
              quality: "YELLOW",
              current_limit: "TIER_1K",
            },
          },
        ],
      },
    ],
  });
  check("payload de qualidade → 200", qual.status === 200, `HTTP ${qual.status}`);
  const paused = await until(async () => {
    const [row] = await query(`
select a.status, a.quality_tier, a.messaging_limit, a.pausado_motivo,
       (select c.status from campaigns c where c.nome = '${MARKER}') as camp_status
  from wa_accounts a where a.phone_number_id = '${PNID}'`);
    return row?.status === "pausada" ? row : null;
  });
  check(
    "conta pausada (YELLOW/TIER_1K) + campanha rodando → pausada",
    paused?.status === "pausada" &&
      paused?.quality_tier === "YELLOW" &&
      paused?.messaging_limit === "TIER_1K" &&
      paused?.camp_status === "pausada",
    JSON.stringify(paused),
  );

  // ---------------------------------------------------------------- Teste e
  console.log("\n[e] inbound: opt-out e resposta normal");
  const optout = await post(inboundBody(PHONE1.replace("+", ""), "wamid.TESTP3.IN1", "PARAR"));
  check("inbound PARAR → 200", optout.status === 200, `HTTP ${optout.status}`);
  const e1 = await until(async () => {
    const [row] = await query(`
select (select count(*)::int from suppression_list where telefone = '${PHONE1}' and motivo = 'opt_out') as suprimido,
       (select opt_in from dispatch_contacts where telefone = '${PHONE1}') as opt_in,
       (select contatado from dispatch_contacts where telefone = '${PHONE1}') as contatado,
       (select status from dispatch_queue dq join dispatch_contacts dc on dc.id = dq.contact_id where dc.telefone = '${PHONE1}') as q_status,
       (select motivo_supressao from dispatch_queue dq join dispatch_contacts dc on dc.id = dq.contact_id where dc.telefone = '${PHONE1}') as q_motivo,
       (select count(*)::int from session_windows sw join dispatch_contacts dc on dc.id = sw.contact_id where dc.telefone = '${PHONE1}') as janela`);
    return Number(row?.suprimido) === 1 ? row : null;
  });
  check(
    "PARAR → suppression_list + opt_in=false + fila 'suprimido'/opt_out + contatado segue false",
    Number(e1?.suprimido) === 1 &&
      e1?.opt_in === false &&
      e1?.contatado === false &&
      e1?.q_status === "suprimido" &&
      e1?.q_motivo === "opt_out" &&
      Number(e1?.janela) === 1,
    JSON.stringify(e1),
  );

  const normal = await post(
    inboundBody(PHONE2.replace("+", ""), "wamid.TESTP3.IN2", "oi tudo bem"),
  );
  check("inbound 'oi tudo bem' → 200", normal.status === 200, `HTTP ${normal.status}`);
  const e2 = await until(async () => {
    const [row] = await query(`
select (select contatado from dispatch_contacts where telefone = '${PHONE2}') as contatado,
       (select opt_in from dispatch_contacts where telefone = '${PHONE2}') as opt_in,
       (select count(*)::int from suppression_list where telefone = '${PHONE2}') as suprimido,
       (select count(*)::int from session_windows sw join dispatch_contacts dc on dc.id = sw.contact_id where dc.telefone = '${PHONE2}') as janela`);
    return row?.contatado === true ? row : null;
  });
  check(
    "'oi tudo bem' → contatado=true + session_window criada (sem supressão)",
    e2?.contatado === true &&
      e2?.opt_in === true &&
      Number(e2?.suprimido) === 0 &&
      Number(e2?.janela) === 1,
    JSON.stringify(e2),
  );
} finally {
  console.log("\nlimpeza dos dados de teste...");
  try {
    await cleanup();
  } catch (e) {
    console.error("cleanup falhou:", e);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} testes OK`);
process.exit(failed.length ? 1 : 0);
