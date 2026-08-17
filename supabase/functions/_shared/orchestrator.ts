// IA orquestrada — cadeia de 3 papéis por turno (prompt-chaining + routing +
// evaluator-optimizer), compartilhada entre produção (evolution-webhook) e o
// simulador (simulate-turn) para não divergir.
//
//   [1] classifyStrategy  — Roteador: lê o histórico e define a estratégia do
//        turno (modelo pequeno/barato). Reaproveita a temperatura já persistida
//        pela análise (analysis.ts) quando existe.
//   [2] (vendedor)         — o cérebro atual (buildSystemPrompt + tool loop),
//        com a estratégia injetada. Fica no chamador (webhook/simulate).
//   [3] runGuards + criticReview — Orquestrador: travas determinísticas (grátis,
//        SEMPRE) + crítico LLM só em turnos de alto risco. Palavra final antes
//        de enviar: pode forçar 1 regeneração.
//
// Papéis auxiliares SEMPRE no modelo pequeno (trava do limite de 30k tokens/min
// do gpt-4o). Nada aqui envia WhatsApp nem grava conversa — só loga uso.
import { chat } from "./openai.ts";
import { chatCostUsd } from "./pricing.ts";
import { handoffJustified } from "./capabilities.ts";

// deno-lint-ignore no-explicit-any
type DB = any;
type Agent = Record<string, unknown>;

export const CLASSIFIER_MODEL = "gpt-4o-mini";
export const CRITIC_MODEL = "gpt-4o-mini";
export const CRITIC_MODEL_HARD = "gpt-4o"; // só quando uma trava sinalizou caso difícil

// Modelo do agente de argumentação (vendedor). Configurável por agente via
// sales_model; cai para model; default gpt-4o (o "forte" vs o mini).
export function salesModel(agent: Agent): string {
  const s = typeof agent.sales_model === "string" ? agent.sales_model.trim() : "";
  const m = typeof agent.model === "string" ? agent.model.trim() : "";
  return s || m || "gpt-4o";
}

export interface Strategy {
  temp: "cold" | "warm" | "hot";
  ready: "book" | "nurture";
  intent: string;
  objection: "price" | "distance" | "fear" | "trust" | "scheduling" | "none";
  tone: "empathetic" | "consultative" | "assertive";
  stakes: "high" | "low";
  checks: Array<"price" | "schedule" | "objection" | "medical">;
}

export interface CriticVerdict {
  verdict: "ok" | "revise";
  issues: string[];
  fix: string; // uma frase imperativa PT-BR, ou ""
}

export interface GuardResult {
  ok: boolean; // false => precisa regenerar
  reason: string; // tag: "handoff_no_tool" | "verbal_stall" | "empty_or_partial" | ""
  fix: string; // instrução para a regeneração
}

// ---------------------------------------------------------------------------
// [1] Classificador (Roteador)
// ---------------------------------------------------------------------------
const CLASSIFIER_SYSTEM = `
Você é o roteador de um atendimento comercial via WhatsApp. Leia as últimas mensagens e responda APENAS com JSON válido, sem texto extra:
{"temp":"cold|warm|hot","ready":"book|nurture","intent":"até 6 palavras","objection":"price|distance|fear|trust|scheduling|none","tone":"empathetic|consultative|assertive","stakes":"high|low","checks":["price"|"schedule"|"objection"|"medical"]}
Regras:
- temp: hot = intenção clara de fechar/agendar; warm = interesse com dúvidas/objeções; cold = curiosidade vaga ou desinteresse.
- ready: "book" se o lead já quer marcar/está pronto; "nurture" se precisa de argumentação/construção de valor antes.
- tone: assertive p/ lead quente e pronto; consultative p/ morno; empathetic p/ frio/objeção/receio.
- stakes: "high" quando o turno envolve PREÇO, AGENDAMENTO/remarcação, uma OBJEÇÃO declarada, ou DÚVIDA MÉDICA/segurança; "low" para saudações, confirmações curtas, small talk.
- checks: quais desses o vendedor precisa cobrir neste turno (lista curta, pode ser vazia).
`.trim();

async function logRole(
  db: DB,
  agentId: string,
  conversationId: string,
  kind: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
) {
  try {
    await db.from("whatsapp_usage").insert({
      agent_id: agentId,
      conversation_id: conversationId,
      kind,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: chatCostUsd(model, promptTokens, completionTokens),
      latency_ms: latencyMs,
    });
  } catch {
    /* best-effort — nunca quebra o atendimento */
  }
}

const VALID = {
  temp: ["cold", "warm", "hot"],
  ready: ["book", "nurture"],
  objection: ["price", "distance", "fear", "trust", "scheduling", "none"],
  tone: ["empathetic", "consultative", "assertive"],
  stakes: ["high", "low"],
  checks: ["price", "schedule", "objection", "medical"],
};
const pick = <T extends string>(v: unknown, allowed: readonly string[], dflt: T): T =>
  allowed.includes(String(v)) ? (v as T) : dflt;

// Mapeia a temperatura persistida pela análise (hot/warm/cold em inglês; alguns
// registros antigos podem estar em pt) para o enum do roteador.
function seedTemp(t?: string | null): Strategy["temp"] | null {
  const s = String(t ?? "").toLowerCase();
  if (s === "hot" || s === "quente") return "hot";
  if (s === "warm" || s === "morno") return "warm";
  if (s === "cold" || s === "frio") return "cold";
  return null;
}

export async function classifyStrategy(
  db: DB,
  agentId: string,
  conversationId: string,
  ordered: { sender: string; content: string | null }[],
  convPrior?: { lead_temperature?: string | null; conversion_probability?: number | null },
): Promise<Strategy | null> {
  try {
    const recent = ordered.slice(-12);
    if (!recent.length) return null;
    const transcript = recent
      .map((m) => `${m.sender === "contact" ? "Lead" : "Atendente"}: ${m.content ?? ""}`)
      .join("\n");
    const seed = seedTemp(convPrior?.lead_temperature);
    const t0 = Date.now();
    const r = await chat({
      model: CLASSIFIER_MODEL,
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM },
        {
          role: "user",
          content:
            (seed ? `Leitura anterior do lead: ${seed}.\n` : "") + `Conversa:\n${transcript}`,
        },
      ],
      temperature: 0,
      maxTokens: 150,
      responseFormat: { type: "json_object" },
    });
    await logRole(
      db,
      agentId,
      conversationId,
      "classify",
      CLASSIFIER_MODEL,
      r.promptTokens,
      r.completionTokens,
      Date.now() - t0,
    );
    let p: Partial<Strategy> = {};
    try {
      p = JSON.parse(r.content ?? "{}");
    } catch {
      return null;
    }
    const checksRaw = Array.isArray(p.checks) ? p.checks : [];
    return {
      temp: seed ?? pick(p.temp, VALID.temp, "warm"),
      ready: pick(p.ready, VALID.ready, "nurture"),
      intent: String(p.intent ?? "").slice(0, 60),
      objection: pick(p.objection, VALID.objection, "none"),
      tone: pick(p.tone, VALID.tone, "consultative"),
      stakes: pick(p.stakes, VALID.stakes, "low"),
      checks: checksRaw.filter((c) => VALID.checks.includes(String(c))) as Strategy["checks"],
    };
  } catch {
    return null; // qualquer erro → chamador usa o caminho legado (bloco de resistência)
  }
}

// ---------------------------------------------------------------------------
// [3a] Travas determinísticas (puras, grátis, SEMPRE) — a solução robusta para
// os bugs recorrentes. Conservadoras (baixo falso-positivo) porque valem p/
// todos os clientes. Cada trava, no máximo, força UMA regeneração.
// ---------------------------------------------------------------------------
const RE_HANDOFF =
  /encaminh|transferir\s+(seu|o)\s+atendimento|secret[aá]ria\s+(vai|ir[áa]|assume|continu)|passar\s+(voc[êe]\s+)?para\s+(um|uma)\s+(humano|pessoa|atendente)|a\s+equipe\s+(vai|ir[áa])\s+(assumir|continuar)/i;
const RE_STALL =
  /\b(vou|vou\s+j[áa]|deixa\s+eu)\s+(verificar|conferir|confirmar|checar|ver)\b|j[áa]\s+(te\s+)?(retorno|volto|respondo)|s[óo]\s+um\s+(momento|minuto|instante)/i;
const HANDOFF_TOOLS = ["encaminhar_humano"];
const STALL_TOOLS = ["verificar_disponibilidade", "consultar_equipe", "agendar"];

export function runGuards(
  finalText: string,
  ctx: { toolNames: string[]; recentUserText: string },
): GuardResult {
  const text = String(finalText ?? "");
  const tools = ctx.toolNames ?? [];
  const stripped = text.replace(/#SEM_RESPOSTA#/g, "").trim();

  // handoff verbalizado sem ferramenta e sem justificativa
  if (
    RE_HANDOFF.test(text) &&
    !tools.some((t) => HANDOFF_TOOLS.includes(t)) &&
    !handoffJustified(ctx.recentUserText ?? "", "")
  ) {
    return {
      ok: false,
      reason: "handoff_no_tool",
      fix: "NÃO diga que vai encaminhar/transferir para secretária/humano — resolva você mesma, responda a pergunta e conduza o atendimento.",
    };
  }

  // "vou verificar/confirmar e já te retorno" sem chamar a ferramenta
  if (RE_STALL.test(text) && !tools.some((t) => STALL_TOOLS.includes(t))) {
    return {
      ok: false,
      reason: "verbal_stall",
      fix: "Não prometa verificar e parar: chame a ferramenta correspondente e traga a informação AGORA na mesma resposta, ou peça o dado que falta.",
    };
  }

  // resposta vazia/quase vazia diante de uma pergunta real do cliente
  const userAsked = (ctx.recentUserText ?? "").trim().length > 10;
  if (stripped.length < 3 && userAsked) {
    return {
      ok: false,
      reason: "empty_or_partial",
      fix: "Responda de fato a última mensagem do cliente com uma mensagem útil e clara.",
    };
  }

  return { ok: true, reason: "", fix: "" };
}

// ---------------------------------------------------------------------------
// [3b] Crítico LLM — só em turnos de alto risco (gate abaixo).
// ---------------------------------------------------------------------------
const TRIVIAL_RE =
  /^(oi+|ol[áa]|ok(ay)?|blz|beleza|obg|obrigad[oa]|valeu|show|perfeito|isso|sim|n[ãa]o|t[áa]|certo|entendi|👍|🙏|😊|❤️|\s)+$/i;

export function shouldCritic(strategy: Strategy | null, lastUserText: string): boolean {
  if (!strategy || strategy.stakes !== "high") return false;
  const t = (lastUserText ?? "").trim();
  if (t.length <= 12) return false;
  if (TRIVIAL_RE.test(t)) return false;
  return true;
}

const CRITIC_SYSTEM = `
Você é o supervisor final de um atendimento comercial via WhatsApp de um consultório médico. Recebe o RASCUNHO que a atendente quer enviar e a estratégia do turno. Responda APENAS com JSON:
{"verdict":"ok|revise","issues":["problema curto"],"fix":"UMA frase imperativa em PT-BR do que corrigir, ou \\"\\""}
Marque "revise" SÓ se houver problema claro:
- não respondeu o que o cliente realmente perguntou;
- soltou um valor/preço sem o contexto devido (ex.: sem dizer a que se refere ou a unidade, quando a conversa exige);
- o tom não bate com a estratégia (ex.: agressivo com lead frio);
- prometeu uma ação ("vou verificar/confirmar") sem de fato executá-la;
- disse que vai passar para um humano/secretária sem motivo válido.
Se estiver bom, "verdict":"ok" com fix "". Seja rigoroso mas não invente problema onde não há.
`.trim();

export async function criticReview(
  db: DB,
  agentId: string,
  conversationId: string,
  args: { strategy: Strategy; lastUserText: string; draft: string; hard: boolean },
): Promise<CriticVerdict> {
  try {
    const model = args.hard ? CRITIC_MODEL_HARD : CRITIC_MODEL;
    const t0 = Date.now();
    const r = await chat({
      model,
      messages: [
        { role: "system", content: CRITIC_SYSTEM },
        {
          role: "user",
          content:
            `Estratégia: tom=${args.strategy.tone}, lead=${args.strategy.temp}, ` +
            `objeção=${args.strategy.objection}, cobrir=${args.strategy.checks.join(",") || "—"}.\n` +
            `Última mensagem do cliente: ${args.lastUserText}\n\n` +
            `RASCUNHO da atendente:\n${args.draft}`,
        },
      ],
      temperature: 0,
      maxTokens: 150,
      responseFormat: { type: "json_object" },
    });
    await logRole(
      db,
      agentId,
      conversationId,
      "critic",
      model,
      r.promptTokens,
      r.completionTokens,
      Date.now() - t0,
    );
    let p: Partial<CriticVerdict> = {};
    try {
      p = JSON.parse(r.content ?? "{}");
    } catch {
      return { verdict: "ok", issues: [], fix: "" };
    }
    return {
      verdict: p.verdict === "revise" ? "revise" : "ok",
      issues: Array.isArray(p.issues) ? p.issues.map(String).slice(0, 3) : [],
      fix: String(p.fix ?? "").trim(),
    };
  } catch {
    return { verdict: "ok", issues: [], fix: "" }; // erro → não bloqueia
  }
}
