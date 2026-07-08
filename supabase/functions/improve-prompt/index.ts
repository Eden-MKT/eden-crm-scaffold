import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/portal.ts";
import { chat } from "../_shared/openai.ts";
import { buildImproveInstruction } from "../_shared/best-practices.ts";

// Reescreve/melhora o system_prompt de um agente aplicando boas práticas. Só staff.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  const staff = await requireStaff(db, req);
  if (!staff) return json({ error: "Unauthorized" }, 401);

  let body: { agentId?: string };
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

  try {
    const r = await chat({
      model: "gpt-4o",
      temperature: 0.5,
      messages: [
        { role: "system", content: buildImproveInstruction(agent) },
        {
          role: "user",
          content: String(agent.system_prompt || "(o atendente ainda não tem um prompt escrito)"),
        },
      ],
    });
    const prompt = (r.content ?? "").trim();
    if (!prompt) return json({ error: "Não foi possível gerar o prompt." }, 502);
    return json({ prompt });
  } catch (e) {
    console.error("improve-prompt error:", e);
    return json({ error: String(e) }, 500);
  }
});
