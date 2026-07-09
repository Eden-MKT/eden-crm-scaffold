// Harness de testes da IA de atendimento.
// Um "cliente" IA (gpt-4o) conversa com a nossa IA real (edge simulate-turn, dry-run);
// salva o transcript e um "analista" IA (gpt-4o) aponta os erros de comportamento.
//
// Uso: node scripts/ai-sim/run.mjs [nome-do-cenario]
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SCENARIOS } from "./scenarios.mjs";

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
const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const OPENAI = env.OPENAI_API_KEY;
const OUT_DIR =
  "C:/Users/filip/AppData/Local/Temp/claude/e--eden-crm-scaffold/ed46f6ef-e858-45a9-aa60-b2a83abfc010/scratchpad/ai-sim";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cliente e analista usam gpt-4o-mini (barato e não disputa o TPM do gpt-4o da IA sob teste).
async function openai(messages, { json = false, model = "gpt-4o-mini" } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: json ? 0.2 : 0.8,
        messages,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (res.status === 429) {
      const body = await res.text();
      const m = body.match(/try again in ([\d.]+)s/i);
      await sleep(Math.ceil((m ? parseFloat(m[1]) : 4) * 1000) + 500);
      continue;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 300));
    return data.choices[0].message.content;
  }
  throw new Error("openai: 429 persistente");
}

// Gera a próxima mensagem do "cliente" IA.
async function customerTurn(persona, transcript) {
  const sys =
    `${persona}\n\nVocê está conversando pelo WhatsApp com o atendimento. Responda como uma pessoa real: ` +
    `curto e informal, uma mensagem por vez. Quando seu objetivo for atingido (agendou) ou você decidir ` +
    `encerrar, escreva a mensagem final e termine com a tag [[FIM]]. Não use a tag antes de encerrar.`;
  // clínica = 'user' (chega pra você); cliente = 'assistant' (você respondeu)
  const msgs = [{ role: "system", content: sys }];
  for (const t of transcript) {
    msgs.push({ role: t.who === "clinic" ? "user" : "assistant", content: t.text });
  }
  if (transcript.length === 0) msgs.push({ role: "user", content: "(inicie a conversa)" });
  return (await openai(msgs)).trim();
}

// Gera a resposta da nossa IA (simulate-turn, dry-run). Retenta erros transitórios.
async function clinicTurn(supabase, agent, transcript) {
  const messages = transcript.map((t) => ({
    role: t.who === "customer" ? "user" : "assistant",
    content: t.text,
  }));
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.functions.invoke("simulate-turn", {
      body: { agent, messages },
    });
    if (!error && !data?.error) return data;
    lastErr =
      data?.error || (await error?.context?.text?.().catch(() => null)) || error?.message || "erro";
    // Respeita "try again in Xs" do 429 (TPM do gpt-4o).
    const m = String(lastErr).match(/try again in ([\d.]+)s/i);
    await sleep(Math.ceil((m ? parseFloat(m[1]) : 5) * 1000) + 800);
  }
  throw new Error(`simulate-turn: ${lastErr}`);
}

const ANALYST_SYS = `Você é um auditor sênior de qualidade de IA de atendimento no WhatsApp (pt-BR).
Analise o TRANSCRIPT de uma conversa entre um cliente e a IA de atendimento (CLÍNICA) e aponte
APENAS problemas reais de comportamento da CLÍNICA. Verifique:
- Repetição: repetiu ou reformulou a mesma mensagem/negativa?
- Formatação: usou lista com marcadores (•, -, *) ou markdown ao dar horários/opções? (deveria ser natural, inline)
- Calor humano: mensagens frias, sem emoji quando caberia (ofertas/confirmações)?
- Alucinação: inventou preço, endereço, horário, nome ou dado não fornecido?
- Objetivo: conduziu ao agendamento quando havia interesse? (NÃO penalize por não agendar quando o cliente disse "vou pensar"/desistiu — nesse caso o CORRETO é acolher e encerrar sem insistir.)
- Encerramento: soube parar (ou ficou em loop de "de nada")? Confundiu "ok" (confirmação) com despedida?
- Naturalidade: soa humano? 1 pergunta por vez?
Política do produto (respeite ao avaliar): a IA NÃO deve ser insistente; se o cliente pergunta a mesma
coisa de novo, a IA pode reafirmar um fato inevitável DESDE QUE varie a forma e agregue algo — só marque
"repetição" quando for repetição gratuita/idêntica. Nunca inventar preço/data/endereço.
Responda em JSON: {"findings":[{"issue","severity":"alta|media|baixa","evidence","suggestion"}]}.
Só inclua achados que sejam problemas REAIS de comportamento. Se não houver, {"findings":[]}.`;

async function analyze(name, transcript) {
  const text = transcript
    .map((t) => `${t.who === "clinic" ? "CLÍNICA" : "CLIENTE"}: ${t.text}`)
    .join("\n");
  const raw = await openai(
    [
      { role: "system", content: ANALYST_SYS },
      { role: "user", content: `Cenário: ${name}\n\nTRANSCRIPT:\n${text}` },
    ],
    { json: true },
  );
  try {
    return JSON.parse(raw).findings ?? [];
  } catch {
    return [
      {
        issue: "Falha ao parsear análise",
        severity: "baixa",
        evidence: raw.slice(0, 200),
        suggestion: "",
      },
    ];
  }
}

async function runScenario(supabase, sc) {
  const transcript = [];
  for (let turn = 0; turn < sc.maxTurns; turn++) {
    const cust = await customerTurn(sc.persona, transcript);
    const ended = /\[\[FIM\]\]/i.test(cust);
    transcript.push({ who: "customer", text: cust.replace(/\[\[FIM\]\]/gi, "").trim() });
    if (ended) break;
    await sleep(1500); // pacing p/ não estourar o TPM do gpt-4o
    const reply = await clinicTurn(supabase, sc.agent, transcript);
    if (reply.silent) {
      transcript.push({ who: "clinic", text: "(sem resposta — encerrou)" });
      break;
    }
    transcript.push({
      who: "clinic",
      text: (reply.bubbles || []).join("\n"),
      tools: reply.toolCalls,
    });
  }
  const findings = await analyze(sc.name, transcript);
  return { transcript, findings };
}

async function main() {
  if (!SUPABASE_URL || !ANON)
    throw new Error("Faltam VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY no .env");
  if (!OPENAI) throw new Error("Falta OPENAI_API_KEY no .env.local");
  const supabase = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: env.SIM_USER_EMAIL,
    password: env.SIM_USER_PASSWORD,
  });
  if (authErr) throw new Error(`Login staff falhou: ${authErr.message}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const only = process.argv[2];
  const list = only ? SCENARIOS.filter((s) => s.name === only) : SCENARIOS;

  for (const sc of list) {
    process.stdout.write(`\n▶ Cenário: ${sc.name}\n`);
    const { transcript, findings } = await runScenario(supabase, sc);

    const md =
      `# ${sc.name}\n\n## Transcript\n\n` +
      transcript
        .map(
          (t) =>
            `**${t.who === "clinic" ? "CLÍNICA" : "CLIENTE"}:** ${t.text}${t.tools?.length ? `  _[tools: ${t.tools.join(", ")}]_` : ""}`,
        )
        .join("\n\n") +
      `\n\n## Achados\n\n` +
      (findings.length
        ? findings
            .map(
              (f) =>
                `- [${f.severity}] ${f.issue}\n  - evidência: ${f.evidence}\n  - sugestão: ${f.suggestion}`,
            )
            .join("\n")
        : "Nenhum achado.");
    writeFileSync(`${OUT_DIR}/${sc.name}.md`, md, "utf8");

    // resumo no console
    console.log(
      transcript
        .map((t) => `  ${t.who === "clinic" ? "IA " : "CLI"}: ${t.text.replace(/\n/g, " ⏎ ")}`)
        .join("\n"),
    );
    console.log(`  — Achados (${findings.length}):`);
    for (const f of findings) console.log(`    • [${f.severity}] ${f.issue}`);
  }
  console.log(`\nTranscripts salvos em ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
