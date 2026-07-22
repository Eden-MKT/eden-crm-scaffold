// Health check das sessões WhatsApp (cron 1/min).
//
// Duas camadas de detecção:
//
// 1. ESTADO — compara connectionState real com whatsapp_agents.status; se
//    deveria estar conectado e não está, tenta UM restart (destrava socket
//    preso sem apagar credenciais) e sincroniza o status real no painel.
//
// 2. CANÁRIO — connectionState "open" NÃO garante que a sessão recebe eventos
//    (sessão "surda", vista em 19/07/2026: pareia, diz open, mas nenhuma
//    mensagem chega). Prova de vida ponta a ponta: envia "[canary ts]" da
//    instância para o PRÓPRIO número; o evolution-webhook confirma o eco
//    gravando last_canary_ok_at (e apaga a mensagem do self-chat). Sem eco em
//    90s → restart + novo canário; 3 falhas seguidas → status disconnected
//    (o painel mostra a verdade em vez de "conectado" mentiroso).
import { admin } from "../_shared/db.ts";
import { json, preflight } from "../_shared/cors.ts";
import { requireCron, requireStaff } from "../_shared/portal.ts";
import * as evo from "../_shared/evolution.ts";

const CANARY_INTERVAL_MS = 30 * 60 * 1000; // prova de vida a cada 30 min
const CANARY_TIMEOUT_MS = 3 * 60 * 1000; // sem ack em 3 min = sessão surda (tolera fila de ingestão)
const CANARY_MAX_FAILS = 3;

// deno-lint-ignore no-explicit-any
type DB = any;

function mapState(state: string): "connected" | "connecting" | "disconnected" {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

async function realState(instance: string): Promise<string> {
  try {
    const st = (await evo.connectionState(instance)) as { instance?: { state?: string } };
    return st.instance?.state ?? "close";
  } catch {
    return "close";
  }
}

async function sendCanary(
  db: DB,
  agent: { id: string; instance_name: string; phone_number: string; last_canary_msg_id?: string | null },
) {
  const selfJid = `${agent.phone_number}@s.whatsapp.net`;
  // Apaga o canário anterior do self-chat (mantém o chat do cliente limpo).
  if (agent.last_canary_msg_id) {
    try {
      await evo.deleteMessageForEveryone(agent.instance_name, {
        id: agent.last_canary_msg_id,
        remoteJid: selfJid,
        fromMe: true,
      });
    } catch {
      /* melhor esforço */
    }
  }
  const sent = (await evo.sendText(
    agent.instance_name,
    selfJid,
    `[canary ${new Date().toISOString()}]`,
    0,
  )) as { key?: { id?: string } };
  await db
    .from("whatsapp_agents")
    .update({
      last_canary_sent_at: new Date().toISOString(),
      last_canary_msg_id: sent?.key?.id ?? null,
    })
    .eq("id", agent.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const db: DB = admin();
  if (!requireCron(req)) {
    const staff = await requireStaff(db, req);
    if (!staff) return json({ error: "Unauthorized" }, 401);
  }

  const { data: agents } = await db
    .from("whatsapp_agents")
    .select(
      "id, instance_name, status, phone_number, last_canary_sent_at, last_canary_ok_at, canary_fails, last_canary_msg_id",
    )
    .not("instance_name", "is", null)
    .in("status", ["connected", "connecting", "disconnected"]);

  let restarted = 0;
  let downgraded = 0;
  let canaries = 0;
  for (const a of agents ?? []) {
    try {
      let state = await realState(a.instance_name);

      // Agente marcado desconectado: só observa — se a sessão reviveu (open),
      // o mapState abaixo promove de volta. Sem restart (evita martelar
      // instância morta a cada minuto; reconectar de verdade é ação humana).
      if (a.status === "disconnected" && state !== "open") continue;

      if (state !== "open" && a.status === "connected") {
        // Deveria estar ativa — tenta ressuscitar o socket.
        try {
          await evo.restartInstance(a.instance_name);
          restarted++;
        } catch {
          /* instância pode nem existir mais */
        }
        await new Promise((r) => setTimeout(r, 4000));
        state = await realState(a.instance_name);
      }

      const status = mapState(state);
      if (status !== a.status) {
        await db.from("whatsapp_agents").update({ status }).eq("id", a.id);
        if (status === "disconnected") {
          downgraded++;
          console.error(`connection-health: agente ${a.id} (${a.instance_name}) caiu para ${status}`);
        }
      }

      // --- Canário (só para sessão que se diz aberta e com número conhecido) ---
      if (state !== "open" || !a.phone_number) continue;
      const sent = a.last_canary_sent_at ? Date.parse(a.last_canary_sent_at) : 0;
      const ok = a.last_canary_ok_at ? Date.parse(a.last_canary_ok_at) : 0;
      const pending = sent > ok;

      if (pending && Date.now() - sent >= CANARY_TIMEOUT_MS) {
        // Canário não ecoou: sessão surda.
        const fails = (a.canary_fails ?? 0) + 1;
        console.error(
          `connection-health: canário sem eco (${fails}/${CANARY_MAX_FAILS}) em ${a.instance_name}`,
        );
        if (fails >= CANARY_MAX_FAILS) {
          await db
            .from("whatsapp_agents")
            .update({ canary_fails: fails, status: "disconnected" })
            .eq("id", a.id);
          downgraded++;
          continue;
        }
        try {
          await evo.restartInstance(a.instance_name);
          restarted++;
        } catch {
          /* melhor esforço */
        }
        await new Promise((r) => setTimeout(r, 4000));
        await db.from("whatsapp_agents").update({ canary_fails: fails }).eq("id", a.id);
        try {
          await sendCanary(db, a);
          canaries++;
        } catch {
          /* envio falhou — fica pendente pelo sent_at antigo e reconta no próximo ciclo */
        }
      } else if (!pending && Date.now() - Math.max(sent, ok) >= CANARY_INTERVAL_MS) {
        // Prova de vida periódica.
        try {
          await sendCanary(db, a);
          canaries++;
        } catch (e) {
          // Nem consegue enviar o canário (ex.: Connection Closed) — conta como falha.
          const fails = (a.canary_fails ?? 0) + 1;
          console.error(`connection-health: falha ao ENVIAR canário em ${a.instance_name}:`, e);
          const patch: Record<string, unknown> = { canary_fails: fails };
          if (fails >= CANARY_MAX_FAILS) {
            patch.status = "disconnected";
            downgraded++;
          }
          await db.from("whatsapp_agents").update(patch).eq("id", a.id);
        }
      }
    } catch (e) {
      console.error(`connection-health: erro no agente ${a.id}:`, e);
    }
  }

  return json({ ok: true, checked: (agents ?? []).length, restarted, downgraded, canaries });
});
