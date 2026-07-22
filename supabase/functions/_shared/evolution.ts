// Cliente fino para a Evolution API v2 (VPS easypanel).
function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `Evolution API não configurada: defina o secret ${name} no projeto Supabase ` +
        `(Settings → Edge Functions → Secrets) e tente de novo.`,
    );
  }
  return v;
}
const BASE = () => requiredEnv("EVOLUTION_API_URL").replace(/\/$/, "");
const KEY = () => requiredEnv("EVOLUTION_API_KEY");

async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers: {
      apikey: KEY(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(
      `Evolution ${method} ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }
  return data;
}

export interface CreateInstanceOpts {
  instanceName: string;
  webhookUrl: string;
  webhookToken: string;
}

export function createInstance(o: CreateInstanceOpts) {
  return call("POST", "/instance/create", {
    instanceName: o.instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    groupsIgnore: true,
    syncFullHistory: false,
    // readMessages OFF: leitura instantânea denuncia robô. O webhook marca
    // como lida com delay aleatório humanizado (markMessageAsRead).
    readMessages: false,
    rejectCall: false,
    webhook: {
      enabled: true,
      url: o.webhookUrl,
      byEvents: false,
      base64: true,
      headers: { "x-webhook-token": o.webhookToken },
      // MESSAGES_UPDATE: acks de entrega chegam PELO socket da sessão — é a
      // prova de vida que confirma o canário do connection-health.
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    },
  });
}

// Atualiza a config de webhook de instância já existente (mesmo formato do create).
export function setWebhook(o: CreateInstanceOpts) {
  return call("POST", `/webhook/set/${encodeURIComponent(o.instanceName)}`, {
    webhook: {
      enabled: true,
      url: o.webhookUrl,
      byEvents: false,
      base64: true,
      headers: { "x-webhook-token": o.webhookToken },
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    },
  });
}

// Retorna { base64, code, pairingCode } — QR expira ~40-60s.
// Com `number` (DDI+DDD+número), a Evolution também gera pairingCode
// para conexão por código digitado no celular (não expira na tela).
export function connectInstance(instance: string, number?: string) {
  const qs = number ? `?number=${encodeURIComponent(number)}` : "";
  return call("GET", `/instance/connect/${encodeURIComponent(instance)}${qs}`);
}

// Retorna { instance: { state: "open"|"connecting"|"close" } }
export function connectionState(instance: string) {
  return call("GET", `/instance/connectionState/${encodeURIComponent(instance)}`);
}

export function fetchInstances(instance: string) {
  return call("GET", `/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`);
}

export function logoutInstance(instance: string) {
  return call("DELETE", `/instance/logout/${encodeURIComponent(instance)}`);
}

export function deleteInstance(instance: string) {
  return call("DELETE", `/instance/delete/${encodeURIComponent(instance)}`);
}

// Reconecta o socket sem apagar credenciais (destrava sessão presa).
export function restartInstance(instance: string) {
  return call("POST", `/instance/restart/${encodeURIComponent(instance)}`);
}

// Marca mensagens recebidas como lidas (check azul). Usado com delay aleatório
// pelo webhook — leitura instantânea denuncia robô (readMessages fica off).
export function markMessageAsRead(
  instance: string,
  keys: Array<{ id: string; fromMe: boolean; remoteJid: string }>,
) {
  return call("POST", `/chat/markMessageAsRead/${encodeURIComponent(instance)}`, {
    readMessages: keys,
  });
}

// Apaga uma mensagem para todos (usado p/ limpar o canário do self-chat).
export function deleteMessageForEveryone(
  instance: string,
  key: { id: string; remoteJid: string; fromMe: boolean },
) {
  return call("DELETE", `/chat/deleteMessageForEveryone/${encodeURIComponent(instance)}`, key);
}

// Garante instância limpa antes de gerar QR de pareamento.
//
// Uma instância com credenciais de sessão anterior (ownerJid preenchido) e
// socket não-aberto é uma "sessão zumbi": o QR gerado sobre ela é recusado
// pelo celular ("não é possível conectar") e nenhum webhook chega — falha
// silenciosa. Nesse caso (ou se a instância não existe), recria do zero.
//
// Proteção contra corrida: logo após o scan do QR a Evolution reinicia a
// sessão (ownerJid setado + estado transitório != open). Para não derrubar um
// pareamento em andamento, só recria se o registro da instância está sem
// atividade há mais de `minStaleMs`.
export async function ensureCleanInstance(
  o: CreateInstanceOpts,
  minStaleMs = 90_000,
): Promise<boolean> {
  let exists = false;
  let ownerJid: string | null = null;
  let updatedAt = 0;
  try {
    const info = (await fetchInstances(o.instanceName)) as Array<{
      ownerJid?: string;
      owner?: string;
      updatedAt?: string;
    }>;
    exists = Array.isArray(info) && info.length > 0;
    ownerJid = (info?.[0]?.ownerJid ?? info?.[0]?.owner ?? null) as string | null;
    updatedAt = info?.[0]?.updatedAt ? new Date(info[0].updatedAt!).getTime() : 0;
  } catch {
    exists = false;
  }

  if (exists) {
    let state = "close";
    try {
      const st = (await connectionState(o.instanceName)) as { instance?: { state?: string } };
      state = st.instance?.state ?? "close";
    } catch {
      state = "close";
    }
    if (state === "open") return false; // saudável — nunca derrubar
    if (!ownerJid && state === "connecting") return false; // QR fresco aguardando scan
    if (Date.now() - updatedAt < minStaleMs) return false; // possível pareamento em curso
    try {
      await logoutInstance(o.instanceName);
    } catch {
      /* sem sessão para deslogar */
    }
    try {
      await deleteInstance(o.instanceName);
    } catch {
      /* melhor esforço */
    }
    // O delete da Evolution é assíncrono: espera a remoção efetivar antes de
    // recriar, senão o create responde 403 "name already in use".
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const left = (await fetchInstances(o.instanceName)) as unknown[];
        if (!Array.isArray(left) || left.length === 0) break;
      } catch {
        break; // 404 = removida
      }
    }
  }

  // Retry curto: cobre o resto da janela de propagação do delete.
  let lastErr: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      await createInstance(o);
      return true;
    } catch (e) {
      lastErr = e;
      if (!String(e).includes("already in use")) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

// Exibe presença ("digitando…") por `delayMs` sem enviar mensagem — usado
// durante a geração da resposta, para o lead não ver silêncio. Best-effort.
export function sendPresence(
  instance: string,
  number: string,
  delayMs: number,
  presence: "composing" | "recording" | "available" = "composing",
) {
  return call("POST", `/chat/sendPresence/${encodeURIComponent(instance)}`, {
    number,
    delay: delayMs,
    presence,
  });
}

// Atualiza as settings de uma instância JÁ criada (retrofit de readMessages etc.).
export function setSettings(instance: string, settings: Record<string, unknown>) {
  return call("POST", `/settings/set/${encodeURIComponent(instance)}`, settings);
}

// Envia texto. `delay` (ms) faz a Evolution exibir "digitando…" (composing)
// automaticamente durante a espera. `quoted` faz a mensagem sair como "resposta"
// (reply/citar) a uma mensagem existente. Retorna { key: { id }, ... }.
export function sendText(
  instance: string,
  number: string,
  text: string,
  delay: number,
  quoted?: unknown,
) {
  return call("POST", `/message/sendText/${encodeURIComponent(instance)}`, {
    number,
    text,
    delay,
    ...(quoted ? { quoted } : {}),
  });
}

// Envia mídia (vídeo/imagem/documento). `mediatype` = "video" | "image" | "document".
// `media` é uma URL pública (ou base64). `delay` (ms) exibe "gravando/enviando…".
// Retorna { key: { id }, ... }.
export function sendMedia(
  instance: string,
  number: string,
  opts: { mediatype: string; media: string; caption?: string; fileName?: string; delay?: number },
) {
  return call("POST", `/message/sendMedia/${encodeURIComponent(instance)}`, {
    number,
    mediatype: opts.mediatype,
    media: opts.media,
    ...(opts.caption ? { caption: opts.caption } : {}),
    ...(opts.fileName ? { fileName: opts.fileName } : {}),
    ...(opts.delay ? { delay: opts.delay } : {}),
  });
}

export function fetchProfilePicture(instance: string, number: string) {
  return call("POST", `/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, { number });
}

// Fallback quando webhook.base64 não entrega a mídia (mídias grandes).
export function getBase64FromMedia(instance: string, key: unknown, message: unknown) {
  return call("POST", `/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
    message: { key, message },
    convertToMp4: false,
  });
}
