import { admin } from "./db.ts";

type Db = ReturnType<typeof admin>;

export type ObjectionConfigItem = {
  tipo: string;
  rotulo?: string;
  gatilhos?: string[];
  video_url?: string;
  abordagem?: string;
};

// Resolve um tipo de objeção contra o objection_config do agente.
export function findObjection(
  agent: { objection_config?: unknown },
  tipo: string,
): ObjectionConfigItem | null {
  const list = Array.isArray(agent.objection_config)
    ? (agent.objection_config as ObjectionConfigItem[])
    : [];
  return list.find((o) => o.tipo === tipo) ?? null;
}

// Decide o que fazer quando a IA chama detectar_objecao.
// Guard-rails NO CÓDIGO: tipo válido, 1x por tipo, precisa de video_url.
// NÃO envia o vídeo aqui — apenas decide e registra. O envio é intercalado
// na fase de saída (ver webhook). Retorna se um vídeo deve ser enviado nesta rodada.
export async function registrarObjecao(
  db: Db,
  args: {
    conversationId: string;
    agent: { objection_config?: unknown };
    objectionsHandled: Record<
      string,
      { detectada?: boolean; video_enviado?: boolean; video_tentado?: boolean; at?: string }
    >;
    tipo: string;
  },
): Promise<{ ok: boolean; enviar_video: boolean; video_url?: string; reason?: string }> {
  const { conversationId, agent, objectionsHandled, tipo } = args;

  const cfg = findObjection(agent, tipo);
  if (!cfg) return { ok: false, enviar_video: false, reason: "tipo_desconhecido" };

  const now = new Date().toISOString();
  const prev = objectionsHandled[tipo] ?? {};
  const jaEnviou = prev.video_enviado === true;
  // Uma tentativa que falhou (ex.: URL fora do ar) também tranca o tipo: sem
  // isso a IA reagiria à mesma objeção de novo e de novo, tentando um vídeo que
  // nunca chega.
  const jaTentou = prev.video_tentado === true;
  const temVideo = typeof cfg.video_url === "string" && cfg.video_url.length > 0;
  const enviar = temVideo && !jaEnviou && !jaTentou;

  // Registra a objeção como detectada (preserva os outros tipos).
  const updated = {
    ...objectionsHandled,
    [tipo]: { ...prev, detectada: true, at: now, video_enviado: prev.video_enviado ?? false },
  };
  const { error } = await db
    .from("whatsapp_conversations")
    .update({ objections_handled: updated })
    .eq("id", conversationId);

  // Se a gravação falhar, NÃO envia o vídeo: sem persistir a trava, um reenvio
  // furaria o "1x por tipo". Melhor não enviar do que enviar sem controle.
  if (error) {
    return { ok: false, enviar_video: false, reason: "erro_persistencia" };
  }

  return {
    ok: true,
    enviar_video: enviar,
    video_url: enviar ? cfg.video_url : undefined,
    reason: enviar
      ? undefined
      : jaEnviou
        ? "ja_enviado"
        : jaTentou
          ? "tentativa_anterior_falhou"
          : temVideo
            ? undefined
            : "sem_video",
  };
}

/** Resultado seguro para o modelo: sem video_url (evita colar o link na bolha). */
export function toolResultForModel(dec: {
  ok: boolean;
  enviar_video: boolean;
  video_url?: string;
  reason?: string;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ok: dec.ok,
    enviar_video: dec.enviar_video,
  };
  if (dec.reason) out.reason = dec.reason;
  if (dec.enviar_video) {
    out.instrucao =
      "O sistema envia o vídeo automaticamente após sua primeira mensagem. NÃO cole links nem URLs do vídeo na resposta — só anuncie em texto que vai mandar o vídeo.";
  }
  return out;
}

/** Remove URLs do bucket de vídeos de objeção (e URL explícita da rodada) do texto. */
export function stripObjectionVideoUrls(text: string, extraUrl?: string | null): string {
  let out = text;
  if (extraUrl) out = out.split(extraUrl).join(" ");
  out = out.replace(/https?:\/\/[^\s<>"')\]]*objection-videos[^\s<>"')\]]*/gi, " ");
  return out.replace(/[ \t]{2,}/g, " ").replace(/ *\n */g, "\n").trim();
}

/**
 * Registra o resultado da tentativa de envio do vídeo (fase de saída).
 *
 * É chamada tanto no sucesso quanto na falha: `video_tentado` tranca o tipo em
 * qualquer caso, para a IA não voltar a reagir à mesma objeção quando o envio
 * não funciona (URL fora do ar, por exemplo). `video_enviado` só fica true
 * quando o vídeo realmente saiu.
 */
export async function registrarTentativaVideo(
  db: Db,
  conversationId: string,
  objectionsHandled: Record<string, unknown>,
  tipo: string,
  resultado: { enviado: boolean; erro?: string },
): Promise<void> {
  const prev = (objectionsHandled[tipo] as Record<string, unknown>) ?? {};
  const updated = {
    ...objectionsHandled,
    [tipo]: {
      ...prev,
      video_tentado: true,
      video_enviado: resultado.enviado,
      ...(resultado.erro ? { video_erro: resultado.erro.slice(0, 300) } : {}),
      at: new Date().toISOString(),
    },
  };
  const { error } = await db
    .from("whatsapp_conversations")
    .update({ objections_handled: updated })
    .eq("id", conversationId);
  if (error) console.error("registrarTentativaVideo: falha ao gravar objections_handled", error);
}
