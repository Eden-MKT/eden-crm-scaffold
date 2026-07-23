// FASE 4 do Disparador — testes de aceite do painel de administração.
// Roda contra o banco real (Management API) + edge function dispatch-admin
// deployada, autenticando com um JWT de STAFF real (SIM_USER_EMAIL/PASSWORD).
// Uso: node scripts/dispatcher/test-phase4.mjs
//
// Testes:
//  a. launch sem dry_run prévio → 400 ("execute o dry-run primeiro").
//  b. dry_run em campanha com 4 contatos (ok / sem opt-in / suppression /
//     cooldown) → {elegiveis:1, sem_opt_in:1, suppression:1, cooldown:1} +
//     amostra com a mensagem renderizada ({{nome}}/{{empresa}} substituídos).
//  c. launch confirm_name errado → 400; certo → status 'rodando' + audit 'launch'.
//  d. template MARKETING sem tem_botao_optout → launch 400 (msg de opt-out).
//  e. panic → campanhas 'rodando' pausadas + contas 'ativa' pausadas com motivo
//     'pânico manual' + audit 'panic'; resume_account reativa a conta.
//  f. sem JWT → 401/403 em todas as ações.
// Todos os seeds são removidos ao final (marker TEST_PHASE4). O cron do worker
// é pausado durante o teste para não competir/enviar.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
const FN = `https://${REF}.supabase.co/functions/v1/dispatch-admin`;
const MARKER = "TEST_PHASE4";
const PNID = "TESTP4_PNID";
const WABA = "TESTP4_WABA";
const PHONE_PREFIX = "+5500777";

if (!env.SIM_USER_EMAIL || !env.SIM_USER_PASSWORD) {
  throw new Error("SIM_USER_EMAIL/SIM_USER_PASSWORD ausentes no .env — necessários p/ JWT staff");
}

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

// JWT staff real via signInWithPassword.
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: env.SIM_USER_EMAIL,
  password: env.SIM_USER_PASSWORD,
});
if (authErr) throw new Error(`login staff falhou: ${authErr.message}`);
const JWT = auth.session.access_token;

// Chama dispatch-admin. authed=false omite o header Authorization (teste f).
async function admin(action, body = {}, { authed = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authed) headers.Authorization = `Bearer ${JWT}`;
  const res = await fetch(FN, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// Pausa o cron do worker durante o teste.
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
delete from dispatch_queue where campaign_id in (select id from campaigns where nome like '${MARKER}%');
delete from wa_message_log where campaign_id in (select id from campaigns where nome like '${MARKER}%');
delete from dispatch_audit_log where entidade_id in (select id::text from campaigns where nome like '${MARKER}%')
   or entidade_id in (select id::text from wa_accounts where phone_number_id = '${PNID}');
delete from suppression_list where telefone like '${PHONE_PREFIX}%';
delete from campaigns where nome like '${MARKER}%';
delete from dispatch_contacts where origem = '${MARKER}';
delete from wa_templates where wa_account_id in (select id from wa_accounts where phone_number_id = '${PNID}');
delete from wa_accounts where phone_number_id = '${PNID}';`);
}

try {
  await pauseCron();
  await cleanup(); // estado limpo se rodada anterior abortou

  // Seeds: conta cloud ativa + 2 templates (com/sem opt-out) + 2 campanhas
  // rascunho + 4 contatos + fila (scheduled no futuro p/ o worker não pegar).
  const seed = await query(`
with acc as (
  insert into wa_accounts (provider, phone_number_id, waba_id, display_number, status, quality_tier, messaging_limit)
  values ('cloud', '${PNID}', '${WABA}', '+5511990000000', 'ativa', 'GREEN', 'TIER_250')
  returning id
), tpl_ok as (
  insert into wa_templates (wa_account_id, nome, categoria, idioma, status_meta, corpo, tem_botao_optout)
  select acc.id, '${MARKER}_ok', 'MARKETING', 'pt_BR', 'APPROVED',
         'Olá {{nome}} da {{empresa}}! Responda SAIR para parar.', true from acc
  returning id
), tpl_no as (
  insert into wa_templates (wa_account_id, nome, categoria, idioma, status_meta, corpo, tem_botao_optout)
  select acc.id, '${MARKER}_no', 'MARKETING', 'pt_BR', 'APPROVED',
         'Olá {{nome}}, promoção!', false from acc
  returning id
), camp_main as (
  insert into campaigns (nome, wa_account_id, template_id, status, janela_hora_inicio, janela_hora_fim, cap_diario, cooldown_dias)
  select '${MARKER}', acc.id, tpl_ok.id, 'rascunho', 0, 23, 200, 30 from acc, tpl_ok
  returning id
), camp_no as (
  insert into campaigns (nome, wa_account_id, template_id, status, janela_hora_inicio, janela_hora_fim, cap_diario, cooldown_dias)
  select '${MARKER}_NOOPT', acc.id, tpl_no.id, 'rascunho', 0, 23, 200, 30 from acc, tpl_no
  returning id
), c as (
  insert into dispatch_contacts (telefone, nome, empresa, opt_in, origem, ultimo_disparo_em)
  values ('${PHONE_PREFIX}000001', 'Ana',    'Acme',    true,  '${MARKER}', null),
         ('${PHONE_PREFIX}000002', 'SemOpt', 'NoOpt',   false, '${MARKER}', null),
         ('${PHONE_PREFIX}000003', 'Supr',   'Sup',     true,  '${MARKER}', null),
         ('${PHONE_PREFIX}000004', 'Cool',   'Cd',      true,  '${MARKER}', now())
  returning id, telefone, nome, empresa
), sup as (
  insert into suppression_list (telefone, motivo, origem)
  values ('${PHONE_PREFIX}000003', 'manual', '${MARKER}')
  returning id
), q_main as (
  insert into dispatch_queue (campaign_id, contact_id, variables, status, scheduled_at)
  select camp_main.id, c.id,
         jsonb_build_object('nome', c.nome, 'empresa', c.empresa),
         'pendente', now() + interval '2 hours'
    from camp_main, c
  returning id
), q_no as (
  insert into dispatch_queue (campaign_id, contact_id, variables, status, scheduled_at)
  select camp_no.id, c.id,
         jsonb_build_object('nome', c.nome, 'empresa', c.empresa),
         'pendente', now() + interval '2 hours'
    from camp_no, c where c.telefone = '${PHONE_PREFIX}000001'
  returning id
)
select (select id from acc) as acc_id,
       (select id from camp_main) as camp_main,
       (select id from camp_no) as camp_no,
       (select count(*) from q_main) as q_main_n;`);
  const accId = seed[0].acc_id;
  const campMain = seed[0].camp_main;
  const campNo = seed[0].camp_no;
  console.log(
    `seed: conta ${accId}, campMain ${campMain} (${seed[0].q_main_n} na fila), campNo ${campNo}`,
  );

  // ---------------------------------------------------------------- Teste a
  console.log("\n[a] launch sem dry_run");
  const a = await admin("launch_campaign", { campaign_id: campMain, confirm_name: MARKER });
  check(
    "launch sem dry_run → 400 (execute o dry-run primeiro)",
    a.status === 400 && /dry-run/i.test(a.json?.error ?? ""),
    `HTTP ${a.status} ${a.json?.error ?? ""}`,
  );

  // ---------------------------------------------------------------- Teste b
  console.log("\n[b] dry_run (4 contatos)");
  const b = await admin("dry_run", { campaign_id: campMain });
  const r = b.json ?? {};
  const amostraOk =
    Array.isArray(r.amostra) &&
    r.amostra.length === 1 &&
    /Olá Ana da Acme/.test(r.amostra[0]?.mensagem ?? "");
  check(
    "dry_run → elegiveis:1, sem_opt_in:1, suppression:1, cooldown:1",
    b.status === 200 &&
      r.elegiveis === 1 &&
      r.suprimidos?.sem_opt_in === 1 &&
      r.suprimidos?.suppression === 1 &&
      r.suprimidos?.cooldown === 1,
    JSON.stringify(r.suprimidos ?? {}) + ` elegiveis=${r.elegiveis}`,
  );
  check(
    "dry_run → amostra com mensagem renderizada",
    amostraOk,
    JSON.stringify(r.amostra?.[0] ?? {}),
  );

  // ---------------------------------------------------------------- Teste c
  console.log("\n[c] launch confirm errado/certo");
  const cWrong = await admin("launch_campaign", { campaign_id: campMain, confirm_name: "errado" });
  check("launch confirm_name errado → 400", cWrong.status === 400, `HTTP ${cWrong.status}`);
  const cRight = await admin("launch_campaign", { campaign_id: campMain, confirm_name: MARKER });
  const [campRow] = await query(`select status from campaigns where id = '${campMain}'`);
  const [auditLaunch] = await query(
    `select count(*)::int as n from dispatch_audit_log where acao = 'launch' and entidade_id = '${campMain}'`,
  );
  check(
    "launch confirm certo → 'rodando' + audit 'launch'",
    cRight.status === 200 && campRow?.status === "rodando" && Number(auditLaunch?.n) === 1,
    `HTTP ${cRight.status} status=${campRow?.status} audit=${auditLaunch?.n}`,
  );

  // ---------------------------------------------------------------- Teste d
  console.log("\n[d] MARKETING sem opt-out");
  await admin("dry_run", { campaign_id: campNo }); // dry_run p/ passar da checagem inicial
  const d = await admin("launch_campaign", {
    campaign_id: campNo,
    confirm_name: `${MARKER}_NOOPT`,
  });
  check(
    "template MARKETING sem opt-out → launch 400",
    d.status === 400 && /opt-out/i.test(d.json?.error ?? ""),
    `HTTP ${d.status} ${d.json?.error ?? ""}`,
  );

  // ---------------------------------------------------------------- Teste e
  console.log("\n[e] panic + resume_account");
  const e = await admin("panic", {});
  const [afterPanic] = await query(`
select (select status from campaigns where id = '${campMain}') as camp_status,
       (select status from wa_accounts where id = '${accId}') as acc_status,
       (select pausado_motivo from wa_accounts where id = '${accId}') as acc_motivo,
       (select count(*)::int from dispatch_audit_log where acao = 'panic') as audit_panic`);
  check(
    "panic → campanha pausada + conta pausada motivo 'pânico manual' + audit",
    e.status === 200 &&
      afterPanic?.camp_status === "pausada" &&
      afterPanic?.acc_status === "pausada" &&
      afterPanic?.acc_motivo === "pânico manual" &&
      Number(afterPanic?.audit_panic) >= 1,
    JSON.stringify(afterPanic),
  );
  const ra = await admin("resume_account", { wa_account_id: accId });
  const [afterResume] = await query(
    `select status, pausado_motivo, pausado_em from wa_accounts where id = '${accId}'`,
  );
  check(
    "resume_account → conta 'ativa' + pausado_* limpos",
    ra.status === 200 &&
      afterResume?.status === "ativa" &&
      afterResume?.pausado_motivo === null &&
      afterResume?.pausado_em === null,
    JSON.stringify(afterResume),
  );

  // ---------------------------------------------------------------- Teste f
  console.log("\n[f] sem JWT → 401/403");
  const actions = [
    ["dry_run", { campaign_id: campMain }],
    ["launch_campaign", { campaign_id: campMain, confirm_name: MARKER }],
    ["panic", {}],
    ["resume_account", { wa_account_id: accId }],
    ["sync_templates", { wa_account_id: accId }],
  ];
  let allBlocked = true;
  const codes = [];
  for (const [act, payload] of actions) {
    const res = await admin(act, payload, { authed: false });
    codes.push(`${act}:${res.status}`);
    if (res.status !== 401 && res.status !== 403) allBlocked = false;
  }
  check("todas as ações sem JWT → 401/403", allBlocked, codes.join(" "));
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
