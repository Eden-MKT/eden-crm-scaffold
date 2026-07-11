import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/portal.ts";
import { chat, type ChatMessage } from "../_shared/openai.ts";
import { NO_REPLY, splitBubbles } from "../_shared/humanize.ts";
import {
  buildSystemPrompt,
  handleVerificar,
  toolsForAgent,
  type ContactAppointment,
} from "../_shared/ai-core.ts";
import {
  resolveService,
  utcToZonedParts,
  zonedToUtc,
  type AgentService,
} from "../_shared/agenda.ts";

// Gera UM turno da IA de atendimento em modo dry-run (sem enviar WhatsApp, sem gravar).
// Usado pelo harness de testes. Reaproveita o MESMO prompt/tools da produção.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db = admin();
  const staff = await requireStaff(db, req);
  if (!staff) return json({ error: "Unauthorized" }, 401);

  let body: {
    agent?: Record<string, unknown>;
    messages?: { role: "user" | "assistant"; content: string }[];
    contact?: { name: string | null; phone: string | null };
    contactAppointments?: ContactAppointment[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const agent = body.agent ?? {};
  const history = Array.isArray(body.messages) ? body.messages : [];
  const contact = body.contact ?? { name: null, phone: null };
  const contactAppointments = Array.isArray(body.contactAppointments)
    ? body.contactAppointments
    : [];
  const model = String(agent.model ?? "gpt-4o");

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(agent, contact, contactAppointments) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tools = toolsForAgent(agent);
  const agendaOn = agent.agenda_enabled === true;
  const calledTools: string[] = [];
  // Agendamentos simulados neste turno (para o runner manter estado entre turnos).
  const bookings: { startsAt: string; serviceLabel: string; replacedPrevious: boolean }[] = [];

  try {
    let finalText: string | null = null;
    for (let i = 0; i < 4; i++) {
      const r = await chat({
        model,
        messages,
        temperature: Number(agent.temperature ?? 0.7),
        tools,
      });
      if (r.toolCalls.length) {
        messages.push(r.assistant as ChatMessage);
        for (const tc of r.toolCalls) {
          calledTools.push(tc.name);
          let result: unknown = { ok: true };
          if (tc.name === "verificar_disponibilidade" && agendaOn) {
            result = await handleVerificar(db, agent, tc.arguments);
          } else if (tc.name === "agendar" && agendaOn) {
            // Dry-run: confirma sem gravar.
            let a: { data?: string; hora?: string; servico?: string } = {};
            try {
              a = JSON.parse(tc.arguments || "{}");
            } catch {
              /* ignora */
            }
            const tz = String(agent.agenda_timezone ?? "America/Sao_Paulo");
            const service = resolveService(
              (agent.agenda_services as AgentService[]) ?? [],
              a.servico,
            );
            if (a.data && a.hora) {
              const local = utcToZonedParts(zonedToUtc(a.data, a.hora, tz), tz);
              // Se o contato já tinha agendamento ativo, simula a remarcação.
              const prev = contactAppointments.find((c) => c.status === "scheduled");
              const prevLocal = prev ? utcToZonedParts(new Date(prev.startsAt), tz) : null;
              bookings.push({
                startsAt: zonedToUtc(a.data, a.hora, tz).toISOString(),
                serviceLabel: service.label,
                replacedPrevious: !!prev,
              });
              result = {
                ok: true,
                simulado: true,
                confirmado: { data: local.dateISO, hora: local.time, servico: service.label },
                ...(prevLocal
                  ? {
                      remarcado: true,
                      horario_anterior: `${prevLocal.dateISO} ${prevLocal.time}`,
                      observacao:
                        "O agendamento anterior foi cancelado; informe ao cliente que foi remarcado.",
                    }
                  : {}),
              };
            } else {
              result = { ok: false, erro: "Informe data e hora." };
            }
          }
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue;
      }
      finalText = r.content;
      break;
    }

    if (!finalText)
      return json({ bubbles: [], finalText: "", toolCalls: calledTools, bookings, silent: true });

    if (finalText.includes(NO_REPLY)) {
      const cleaned = finalText.split(NO_REPLY).join("").trim();
      if (!cleaned)
        return json({ bubbles: [], finalText: "", toolCalls: calledTools, bookings, silent: true });
      finalText = cleaned;
    }

    return json({ bubbles: splitBubbles(finalText), finalText, toolCalls: calledTools, bookings });
  } catch (e) {
    console.error("simulate-turn error:", e);
    return json({ error: String(e) }, 500);
  }
});
