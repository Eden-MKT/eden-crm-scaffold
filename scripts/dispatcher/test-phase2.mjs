// FASE 2 do Disparador — testes de aceite do worker de fila.
// Roda contra o banco real (Management API) + edge function deployada.
// Uso: node scripts/dispatcher/test-phase2.mjs
//
// Testes:
//  1. Smoke do worker: 3 contatos (suprimido / sem opt-in / ok) — os dois
//     primeiros ficam 'suprimido' com motivo certo e SEM log; o ok tenta
//     enviar (instância evolution inexistente → backoff ou falha).
//  2. Claim concorrente: 10 itens, 2 chamadas paralelas de
//     claim_dispatch_batch(10) — soma 10, sem interseção.
//  3. Reaper: item 'processando' com lock velho volta a 'pendente'.
// Todos os dados de teste são removidos ao final (marker TEST_PHASE2).
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
const MARKER = "TEST_PHASE2";
const PHONE_PREFIX = "+5500999";

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
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// Token do cron no Vault (mesmo que invoke_edge_function usa).
const [{ decrypted_secret: cronToken }] = await query(
  "select decrypted_secret from vault.decrypted_secrets where name = 'cron_edge_token'",
);
if (!cronToken) throw new Error("cron_edge_token ausente no vault");

async function runWorker() {
  const res = await fetch(`https://${REF}.supabase.co/functions/v1/dispatch-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-token": cronToken },
    body: "{}",
  });
  const body = await res.json().catch(() => null);
  console.log(`worker: HTTP ${res.status} ${JSON.stringify(body)}`);
  return { status: res.status, body };
}

// Pausa o cron durante os testes para o job de 1 min não competir pelo claim.
let cronPaused = false;
async function pauseCron() {
  await query(`
do $do$ begin
  if exists (select 1 from cron.job where jobname = 'dispatch-worker-1min') then
    perform cron.unschedule('dispatch-worker-1min');
  end if;
end $do$;`);
  cronPaused = true;
}
async function resumeCron() {
  if (!cronPaused) return;
  await query(
    `select cron.schedule('dispatch-worker-1min', '* * * * *', $cron$select public.invoke_edge_function('dispatch-worker')$cron$)`,
  );
  cronPaused = false;
}

async function cleanup() {
  await query(`
delete from dispatch_queue where campaign_id in (select id from campaigns where nome = '${MARKER}');
delete from wa_message_log where campaign_id in (select id from campaigns where nome = '${MARKER}');
delete from suppression_list where origem = '${MARKER}' or telefone like '${PHONE_PREFIX}%';
delete from session_windows where contact_id in (select id from dispatch_contacts where origem = '${MARKER}');
delete from campaigns where nome = '${MARKER}';
delete from dispatch_contacts where origem = '${MARKER}';
delete from wa_accounts where id not in (select wa_account_id from campaigns) and evolution_instance = 'nao-existe';`);
}

try {
  await pauseCron();
  await cleanup(); // estado limpo se rodada anterior abortou

  // ---------------------------------------------------------------- Teste 1
  console.log("\n[1] smoke do worker (supressao / opt-in / envio)");
  const seed = await query(`
with acc as (
  insert into wa_accounts (provider, evolution_instance, status, quality_tier, throughput_msg_por_segundo)
  values ('evolution', 'nao-existe', 'ativa', 'UNKNOWN', 2)
  returning id
), camp as (
  insert into campaigns (nome, wa_account_id, status, janela_hora_inicio, janela_hora_fim, cap_diario, cooldown_dias, corpo_livre)
  select '${MARKER}', acc.id, 'rodando', 0, 23, 100, 0, 'Olá {{nome}} da {{empresa}}' from acc
  returning id, wa_account_id
), c as (
  insert into dispatch_contacts (telefone, nome, empresa, opt_in, origem)
  values ('${PHONE_PREFIX}000001', 'Suprimido', '${MARKER}', true,  '${MARKER}'),
         ('${PHONE_PREFIX}000002', 'SemOptin',  '${MARKER}', false, '${MARKER}'),
         ('${PHONE_PREFIX}000003', 'Ok',        '${MARKER}', true,  '${MARKER}')
  returning id
), sup as (
  insert into suppression_list (telefone, motivo, origem)
  values ('${PHONE_PREFIX}000001', 'manual', '${MARKER}')
  returning id
), q as (
  insert into dispatch_queue (campaign_id, contact_id, scheduled_at)
  select camp.id, c.id, now() - interval '1 minute' from camp, c
  returning id
)
select (select id from camp) as campaign_id, (select wa_account_id from camp) as account_id, (select count(*) from q) as queued;`);
  const campaignId = seed[0].campaign_id;
  console.log(`campanha ${campaignId} — ${seed[0].queued} itens na fila`);

  const w = await runWorker();
  check("worker respondeu 200 com resumo", w.status === 200 && typeof w.body?.claimed === "number");

  const rows = await query(`
select dc.telefone, dq.status, dq.motivo_supressao, dq.tentativas, dq.last_error,
       (select count(*) from wa_message_log l where l.contact_id = dc.id) as logs
  from dispatch_queue dq
  join dispatch_contacts dc on dc.id = dq.contact_id
 where dq.campaign_id = '${campaignId}'
 order by dc.telefone;`);
  const byPhone = Object.fromEntries(rows.map((r) => [r.telefone, r]));
  const r1 = byPhone[`${PHONE_PREFIX}000001`];
  const r2 = byPhone[`${PHONE_PREFIX}000002`];
  const r3 = byPhone[`${PHONE_PREFIX}000003`];
  check(
    "contato em suppression_list → 'suprimido' motivo suppression_list, sem log",
    r1?.status === "suprimido" &&
      r1?.motivo_supressao === "suppression_list" &&
      Number(r1?.logs) === 0,
    JSON.stringify(r1),
  );
  check(
    "contato opt_in=false → 'suprimido' motivo sem_opt_in, sem log",
    r2?.status === "suprimido" && r2?.motivo_supressao === "sem_opt_in" && Number(r2?.logs) === 0,
    JSON.stringify(r2),
  );
  const okAttempted =
    (r3?.status === "pendente" && Number(r3?.tentativas) > 0) ||
    r3?.status === "falha" ||
    (r3?.status === "enviado" && Number(r3?.logs) > 0);
  check(
    "contato ok tentou enviar (backoff/falha; nunca 'enviado' sem log)",
    okAttempted,
    JSON.stringify(r3),
  );

  // ---------------------------------------------------------------- Teste 2
  console.log("\n[2] claim concorrente (FOR UPDATE SKIP LOCKED)");
  const seeded = await query(`
with c as (
  insert into dispatch_contacts (telefone, nome, opt_in, origem)
  select '${PHONE_PREFIX}1000' || lpad(g::text, 2, '0'), 'Par' || g, true, '${MARKER}'
    from generate_series(1, 10) g
  returning id
), q as (
  insert into dispatch_queue (campaign_id, contact_id, scheduled_at)
  select '${campaignId}', c.id, now() - interval '1 minute' from c
  returning id
)
select array_agg(id) as ids from q;`);
  const ourIds = new Set(seeded[0].ids);

  const [a, b] = await Promise.all([
    query("select id from public.claim_dispatch_batch(10)"),
    query("select id from public.claim_dispatch_batch(10)"),
  ]);
  const idsA = a.map((r) => r.id);
  const idsB = b.map((r) => r.id);
  const oursA = idsA.filter((id) => ourIds.has(id));
  const oursB = idsB.filter((id) => ourIds.has(id));
  const overlap = idsA.filter((id) => idsB.includes(id));
  check(
    "soma dos claims cobre os 10 itens, sem interseção de ids",
    oursA.length + oursB.length === 10 && overlap.length === 0,
    `A=${idsA.length} (nossos ${oursA.length}), B=${idsB.length} (nossos ${oursB.length}), overlap=${overlap.length}`,
  );
  // Devolve qualquer item alheio que o claim tenha pego junto.
  const foreign = [...idsA, ...idsB].filter((id) => !ourIds.has(id));
  if (foreign.length) {
    await query(
      `update dispatch_queue set status='pendente', locked_at=null where id in (${foreign.map((i) => `'${i}'`).join(",")})`,
    );
  }

  // ---------------------------------------------------------------- Teste 3
  console.log("\n[3] reaper de locks orfaos");
  const [reapSeed] = await query(`
update dispatch_queue
   set status = 'processando', locked_at = now() - interval '10 minutes', tentativas = 0
 where id = '${[...ourIds][0]}'
returning id;`);
  await query("select public.reap_dispatch_locks()");
  const [reaped] = await query(
    `select status, locked_at, tentativas from dispatch_queue where id = '${reapSeed.id}'`,
  );
  check(
    "item com lock >5min voltou a 'pendente' (locked_at null, tentativas+1)",
    reaped?.status === "pendente" && reaped?.locked_at === null && Number(reaped?.tentativas) === 1,
    JSON.stringify(reaped),
  );
} finally {
  console.log("\nlimpeza dos dados de teste...");
  try {
    await cleanup();
  } catch (e) {
    console.error("cleanup falhou:", e);
  }
  await resumeCron();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} testes OK`);
process.exit(failed.length ? 1 : 0);
