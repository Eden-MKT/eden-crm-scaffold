// Cliente fino para a Evolution API v2 (VPS easypanel).
const BASE = () => Deno.env.get("EVOLUTION_API_URL")!.replace(/\/$/, "");
const KEY = () => Deno.env.get("EVOLUTION_API_KEY")!;

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
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
    readMessages: false,
    rejectCall: false,
    webhook: {
      enabled: true,
      url: o.webhookUrl,
      byEvents: false,
      base64: true,
      headers: { "x-webhook-token": o.webhookToken },
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    },
  });
}

// Retorna { base64, code, pairingCode } — QR expira ~40-60s.
export function connectInstance(instance: string) {
  return call("GET", `/instance/connect/${encodeURIComponent(instance)}`);
}

// Retorna { instance: { state: "open"|"connecting"|"close" } }
export function connectionState(instance: string) {
  return call(
    "GET",
    `/instance/connectionState/${encodeURIComponent(instance)}`,
  );
}

export function fetchInstances(instance: string) {
  return call(
    "GET",
    `/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`,
  );
}

export function logoutInstance(instance: string) {
  return call("DELETE", `/instance/logout/${encodeURIComponent(instance)}`);
}

export function deleteInstance(instance: string) {
  return call("DELETE", `/instance/delete/${encodeURIComponent(instance)}`);
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

export function fetchProfilePicture(instance: string, number: string) {
  return call(
    "POST",
    `/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`,
    { number },
  );
}

// Fallback quando webhook.base64 não entrega a mídia (mídias grandes).
export function getBase64FromMedia(
  instance: string,
  key: unknown,
  message: unknown,
) {
  return call(
    "POST",
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`,
    { message: { key, message }, convertToMp4: false },
  );
}
