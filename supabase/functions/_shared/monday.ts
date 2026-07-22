// Integração Monday.com (fase A): cria/atualiza o card do lead e move de grupo
// conforme lead_status. Chamado pós-resposta pelo evolution-webhook, atrás da
// flag monday_enabled do agente. Falha isolada — nunca quebra o atendimento.

const MONDAY_API = "https://api.monday.com/v2";

// deno-lint-ignore no-explicit-any
type DB = any;

// Executa uma query/mutation GraphQL no Monday. Lança em erro de transporte ou
// em erros GraphQL (json.errors) — o chamador (syncMonday) captura e loga.
export async function mondayQuery(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(MONDAY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || body.errors?.length) {
    const msg = body.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(`monday: ${msg}`);
  }
  return body.data ?? {};
}

// Sincroniza o lead desta conversa com o board Monday do agente.
// - 1ª vez: create_item (grava monday_item_id) + preenche colunas.
// - Depois: move de grupo (por lead_status) + atualiza colunas.
// No-op se monday_enabled/board_id/token ausentes. Falha isolada.
export async function syncMonday(
  db: DB,
  agent: Record<string, unknown>,
  conversationId: string,
  leadPhone: string | null,
): Promise<void> {
  if (agent.monday_enabled !== true) return;
  const token = String(agent.monday_token ?? "").trim();
  const boardId = String(agent.monday_board_id ?? "").trim();
  if (!token || !boardId) return;

  try {
    const { data: conv } = await db
      .from("whatsapp_conversations")
      .select("monday_item_id, contact_name, context_summary, lead_interest, lead_status")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) return;

    const groupMap = (agent.monday_group_map ?? {}) as Record<string, string>;
    const status = String(conv.lead_status ?? "");
    const groupId = groupMap[status] || "";

    const nome = String(conv.contact_name ?? "").trim() || String(leadPhone ?? "").trim() || "Lead";

    // Contexto = interesse + resumo (o que a equipe lê no card).
    const interesse = String(conv.lead_interest ?? "").trim();
    const resumo = String(conv.context_summary ?? "").trim();
    const contexto = [interesse ? `Interesse: ${interesse}.` : "", resumo]
      .filter(Boolean)
      .join(" ");

    // column_values do Monday (JSON string). phone exige {phone, countryShortName}.
    const colVals: Record<string, unknown> = {};
    if (leadPhone) colVals["phone"] = { phone: String(leadPhone), countryShortName: "BR" };
    if (contexto) colVals["text_mktc3qx2"] = contexto;
    const colValsJson = JSON.stringify(colVals);

    let itemId = String(conv.monday_item_id ?? "").trim();

    if (!itemId) {
      // Cria o item no grupo do status atual (ou sem grupo se não mapeado).
      // Risco aceito (fase A): se o create der certo mas o UPDATE do monday_item_id
      // abaixo falhar, a próxima rodada cria um card duplicado. Precisa de duas
      // falhas seguidas na mesma conversa — tolerável aqui; two-way sync é fase B.
      const q = `mutation ($board: ID!, $group: String, $name: String!, $cols: JSON) {
        create_item (board_id: $board, group_id: $group, item_name: $name, column_values: $cols) { id }
      }`;
      const data = await mondayQuery(token, q, {
        board: boardId,
        group: groupId || null,
        name: nome,
        cols: colValsJson,
      });
      itemId = String((data.create_item as { id?: string })?.id ?? "");
      if (itemId) {
        await db
          .from("whatsapp_conversations")
          .update({ monday_item_id: itemId })
          .eq("id", conversationId);
      }
    } else {
      try {
        // Move de grupo (se mapeado) e atualiza colunas.
        if (groupId) {
          const mq = `mutation ($item: ID!, $group: String!) {
            move_item_to_group (item_id: $item, group_id: $group) { id }
          }`;
          await mondayQuery(token, mq, { item: itemId, group: groupId });
        }
        const cq = `mutation ($board: ID!, $item: ID!, $cols: JSON!) {
          change_multiple_column_values (board_id: $board, item_id: $item, column_values: $cols) { id }
        }`;
        await mondayQuery(token, cq, { board: boardId, item: itemId, cols: colValsJson });
      } catch (e) {
        // Se o card foi apagado/arquivado no Monday, todas as próximas rodadas
        // falhariam para sempre nesta conversa (o id fica gravado e o erro era
        // engolido). Esquecemos o id para que o card seja recriado na próxima.
        if (isItemGone(e)) {
          console.warn(
            `syncMonday: card ${itemId} não existe mais (conv=${conversationId}); será recriado`,
          );
          await db
            .from("whatsapp_conversations")
            .update({ monday_item_id: null })
            .eq("id", conversationId);
        } else {
          throw e;
        }
      }
    }
  } catch (e) {
    console.error("syncMonday error", e);
  }
}

/** Erro do Monday indicando que o item não existe mais (apagado ou arquivado). */
function isItemGone(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e).toLowerCase();
  return (
    msg.includes("inactive item") ||
    msg.includes("item not found") ||
    msg.includes("does not exist") ||
    msg.includes("invalid item")
  );
}
