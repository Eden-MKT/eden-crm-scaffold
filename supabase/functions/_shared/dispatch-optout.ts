// Disparador WhatsApp — FASE 3: detector de opt-out + rastreio de inbound.
//
// Compartilhado entre o evolution-webhook (número não-oficial) e o
// wa-cloud-webhook (Cloud API oficial). Qualquer mensagem INBOUND de um
// telefone presente em dispatch_contacts:
//   - abre/renova a janela de sessão de 24h (session_windows);
//   - se for pedido de opt-out → suppression_list (append-only), opt_in=false
//     e itens 'pendente' da fila viram 'suprimido';
//   - senão → marca contatado=true (resposta inbound é o ÚNICO sinal válido).

// deno-lint-ignore no-explicit-any
type DB = any;

export interface DispatchInboundResult {
  tracked: boolean;
  optedOut: boolean;
  confirmMsg?: string;
}

export const OPTOUT_CONFIRM_MSG =
  "Pronto! Você foi removido da nossa lista e não receberá mais mensagens. 👍";

// Normaliza para comparação: minúsculas, sem acentos (NFD), sem pontuação,
// espaços colapsados.
export function normalizeMsg(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Palavras/frases de opt-out (já normalizadas — sem acento, minúsculas).
const OPTOUT_KEYWORDS = [
  "sair",
  "parar",
  "pare",
  "cancelar",
  "descadastrar",
  "descadastro",
  "stop",
  "remover",
  "nao quero",
  "nao envie",
  "me tira",
  "me tire",
];

// Conservador de propósito: match se a mensagem normalizada INTEIRA for uma
// keyword, OU se tiver até 4 palavras e contiver uma keyword como palavra/frase
// completa (limite de palavra dos dois lados). "quero parar de sentir dor"
// (5 palavras) NÃO conta; "parar", "quero sair", "nao quero mais" contam.
export function isOptOut(s: string): boolean {
  const msg = normalizeMsg(s);
  if (!msg) return false;
  if (OPTOUT_KEYWORDS.includes(msg)) return true;
  if (msg.split(" ").length > 4) return false;
  const padded = ` ${msg} `;
  return OPTOUT_KEYWORDS.some((k) => padded.includes(` ${k} `));
}

// Processa uma mensagem inbound vinda de qualquer provider.
// `phone` pode vir em qualquer formato (JID sem sufixo, com/sem '+').
// `provider` vira a `origem` do registro em suppression_list.
export async function processDispatchInbound(
  db: DB,
  phone: string,
  text: string,
  provider: string,
): Promise<DispatchInboundResult> {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return { tracked: false, optedOut: false };

  // dispatch_contacts.telefone pode estar salvo com ou sem '+'.
  const { data: contato } = await db
    .from("dispatch_contacts")
    .select("id, telefone")
    .in("telefone", [digits, `+${digits}`])
    .limit(1)
    .maybeSingle();
  if (!contato) return { tracked: false, optedOut: false };

  // Inbound abre/renova a janela de sessão de 24h da Meta (texto livre).
  const now = Date.now();
  await db.from("session_windows").upsert(
    {
      contact_id: contato.id,
      aberta_em: new Date(now).toISOString(),
      expira_em: new Date(now + 24 * 3_600_000).toISOString(),
    },
    { onConflict: "contact_id" },
  );

  if (isOptOut(text)) {
    await db
      .from("suppression_list")
      .upsert(
        { telefone: contato.telefone, motivo: "opt_out", origem: provider },
        { onConflict: "telefone", ignoreDuplicates: true },
      );
    await db.from("dispatch_contacts").update({ opt_in: false }).eq("id", contato.id);
    await db
      .from("dispatch_queue")
      .update({ status: "suprimido", motivo_supressao: "opt_out" })
      .eq("contact_id", contato.id)
      .eq("status", "pendente");
    return { tracked: true, optedOut: true, confirmMsg: OPTOUT_CONFIRM_MSG };
  }

  // Resposta real do contato — único sinal que marca 'contatado'.
  await db.from("dispatch_contacts").update({ contatado: true }).eq("id", contato.id);
  return { tracked: true, optedOut: false };
}
