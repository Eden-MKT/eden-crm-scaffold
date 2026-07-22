// Análise de lead (equivalente ao Orquestrador_CRM do n8n): gera temperatura,
// probabilidade de conversão, resumo e status a partir do histórico da conversa.
// Compartilhado entre analyze-conversation (botão do painel) e orchestrator-run (cron).
import { chat } from "./openai.ts";
import { chatCostUsd } from "./pricing.ts";

// deno-lint-ignore no-explicit-any
type DB = any;

export interface AnalysisResult {
  lead_temperature: "hot" | "warm" | "cold";
  conversion_probability: number;
  analysis_summary: string;
  lead_interest: string | null;
  lead_status: "em_atendimento" | "qualificado" | "desqualificado";
}

const ANALYSIS_SYSTEM = `
Você é um analista de leads de atendimento via WhatsApp. Analise a conversa e responda APENAS com JSON válido:
{
  "lead_temperature": "hot" | "warm" | "cold",
  "conversion_probability": 0-100,
  "analysis_summary": "resumo objetivo em 1-3 frases (PT-BR) do estado do lead e do que falta para converter",
  "lead_interest": "interesse/motivo principal do lead em poucas palavras (ou null)",
  "lead_status": "em_atendimento" | "qualificado" | "desqualificado"
}
Critérios:
- hot: intenção clara de compra/agendamento, pediu horário/valor para fechar, respondeu rápido e engajado.
- warm: interesse real mas com dúvidas/objeções em aberto ou sem urgência.
- cold: respostas curtas/desinteressadas, sumiu, ou só curiosidade vaga.
- qualificado: demonstrou intenção concreta (pediu agendamento/falar com humano/fechou).
- desqualificado: SPAM, proposta comercial PARA a empresa, linguagem abusiva, número errado.
- Objeção não desqualifica: preço como barreira/medo/distância = warm ou hot com objeção.
`.trim();

export async function analyzeConversation(
  db: DB,
  conversationId: string,
): Promise<AnalysisResult | null> {
  const { data: conv } = await db
    .from("whatsapp_conversations")
    .select("id, agent_id, contact_name, lead_interest, objections_handled, converted")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return null;

  const { data: history } = await db
    .from("whatsapp_messages")
    .select("sender, content, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(40);
  const ordered = (history ?? []).reverse();
  if (!ordered.length) return null;

  const transcript = ordered
    .map(
      (m: { sender: string; content: string | null }) =>
        `${m.sender === "contact" ? "Lead" : "Atendente"}: ${m.content ?? ""}`,
    )
    .join("\n");

  // objections_handled é { tipo: {detectada, video_enviado, at} } — os tipos detectados são as chaves.
  const objections =
    conv.objections_handled && typeof conv.objections_handled === "object"
      ? Object.keys(conv.objections_handled as Record<string, unknown>).join(", ")
      : "";

  const r = await chat({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM },
      {
        role: "user",
        content:
          `Lead: ${conv.contact_name ?? "sem nome"}${conv.converted ? " (JÁ CONVERTIDO)" : ""}\n` +
          (objections ? `Objeções registradas: ${objections}\n` : "") +
          `\nConversa:\n${transcript}`,
      },
    ],
    temperature: 0.1,
    maxTokens: 300,
    responseFormat: { type: "json_object" },
  });

  let parsed: Partial<AnalysisResult> = {};
  try {
    parsed = JSON.parse(r.content ?? "{}");
  } catch {
    return null;
  }

  const temperature = ["hot", "warm", "cold"].includes(String(parsed.lead_temperature))
    ? (parsed.lead_temperature as AnalysisResult["lead_temperature"])
    : "cold";
  const probability = Math.min(100, Math.max(0, Number(parsed.conversion_probability) || 0));
  const status = ["em_atendimento", "qualificado", "desqualificado"].includes(
    String(parsed.lead_status),
  )
    ? (parsed.lead_status as AnalysisResult["lead_status"])
    : "em_atendimento";

  const result: AnalysisResult = {
    lead_temperature: temperature,
    conversion_probability: probability,
    analysis_summary: String(parsed.analysis_summary ?? "").trim(),
    lead_interest: (parsed.lead_interest ? String(parsed.lead_interest).trim() : null) || null,
    lead_status: status,
  };

  await db
    .from("whatsapp_conversations")
    .update({
      lead_temperature: result.lead_temperature,
      conversion_probability: result.conversion_probability,
      analysis_summary: result.analysis_summary,
      ...(result.lead_interest && !conv.lead_interest
        ? { lead_interest: result.lead_interest }
        : {}),
      lead_status: result.lead_status,
      analyzed_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  try {
    await db.from("whatsapp_usage").insert({
      agent_id: conv.agent_id,
      conversation_id: conversationId,
      kind: "analysis",
      model: "gpt-4o-mini",
      prompt_tokens: r.promptTokens,
      completion_tokens: r.completionTokens,
      cost_usd: chatCostUsd("gpt-4o-mini", r.promptTokens, r.completionTokens),
    });
  } catch {
    /* best-effort */
  }

  return result;
}
