import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/portal.ts";
import { chat } from "../_shared/openai.ts";
import { buildImproveInstruction, findMissingFacts } from "../_shared/best-practices.ts";

// Reescreve/melhora o system_prompt de um agente aplicando boas práticas. Só staff.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  const staff = await requireStaff(db, req);
  if (!staff) return json({ error: "Unauthorized" }, 401);

  let body: { agentId?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const agentId = String(body.agentId ?? "");
  if (!agentId) return json({ error: "agentId obrigatório" }, 400);

  const { data: agent } = await db
    .from("whatsapp_agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return json({ error: "Agente não encontrado" }, 404);

  // Usa o texto ATUAL do editor quando enviado — senão o painel perderia as
  // edições ainda não salvas ao clicar em "Melhorar".
  const original = String(body.prompt ?? "").trim() || String(agent.system_prompt ?? "").trim();
  const instruction = buildImproveInstruction(agent);

  // CRÍTICO: o padrão de `chat` é 700 tokens — o que TRUNCAVA o prompt melhorado
  // no meio (era esta a "perda de informação"). Dimensiona a saída pelo tamanho
  // do original com folga para a estrutura acrescentada (~3,5 chars/token em pt-BR).
  const maxTokens = Math.min(16000, Math.max(2000, Math.ceil(original.length / 2)));
  const generate = (messages: Parameters<typeof chat>[0]["messages"]) =>
    chat({ model: "gpt-4o", temperature: 0.3, messages, maxTokens });

  try {
    const r = await generate([
      { role: "system", content: instruction },
      { role: "user", content: original || "(o atendente ainda não tem um prompt escrito)" },
    ]);
    let prompt = (r.content ?? "").trim();
    if (!prompt) return json({ error: "Não foi possível gerar o prompt." }, 502);

    // Rede de segurança: nada do original pode sumir. Dois sinais de perda —
    // (1) dados concretos que sumiram; (2) encurtamento relevante, que denuncia
    // regras/instruções condensadas (o detector de fatos não pega isso).
    const tooShort = (t: string) => original.length > 0 && t.length < original.length * 0.9;
    let missing = original ? findMissingFacts(original, prompt) : [];
    let shrunk = tooShort(prompt);

    if (missing.length || shrunk) {
      const queixa = [
        missing.length
          ? `Você APAGOU dados que existiam no original. Reinsira EXATAMENTE, sem alterar:\n` +
            missing.map((m) => `- ${m}`).join("\n")
          : "",
        shrunk
          ? `Você ENCURTOU o prompt de ${original.length} para ${prompt.length} caracteres. ` +
            `Isso significa que resumiu ou eliminou instruções. Reponha TODAS as regras, ` +
            `orientações e exemplos do original — reorganizar é permitido, encurtar NÃO. ` +
            `O resultado deve ter no mínimo o tamanho do original.`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const retry = await generate([
        { role: "system", content: instruction },
        { role: "user", content: original },
        { role: "assistant", content: prompt },
        { role: "user", content: `${queixa}\n\nResponda APENAS com o prompt final completo.` },
      ]);
      const fixed = (retry.content ?? "").trim();
      if (fixed) {
        const m2 = findMissingFacts(original, fixed);
        // Aceita a 2ª versão se recuperou dados ou ficou mais completa sem perder nada.
        if (
          m2.length < missing.length ||
          (m2.length <= missing.length && fixed.length > prompt.length)
        ) {
          prompt = fixed;
          missing = m2;
          shrunk = tooShort(prompt);
        }
      }
    }

    return json({ prompt, missing, shrunk, originalLength: original.length });
  } catch (e) {
    console.error("improve-prompt error:", e);
    return json({ error: String(e) }, 500);
  }
});
