/**
 * Resolução do telefone real do lead a partir do payload da Evolution.
 *
 * Contas migradas chegam com remoteJid `@lid`, onde a parte antes do "@" é um
 * identificador interno do WhatsApp — NÃO um telefone. Gravar esse número gera
 * card no CRM com contato impossível de ligar e agendamento sem telefone para
 * confirmar, e falha em silêncio (o Monday aceita 15 dígitos sem reclamar).
 *
 * Procuramos o número verdadeiro nos campos que a Evolution costuma enviar e,
 * se nenhum servir, devolvemos null — melhor não ter telefone do que ter um
 * número inventado.
 */

/** Telefone com DDI tem 10–15 dígitos; ids de LID são maiores. */
function onlyDigitsIfPhone(v: unknown): string | null {
  const d = String(v ?? "")
    .split("@")[0]
    .replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export function resolveLeadPhone(
  data: Record<string, unknown>,
  remoteJid: string,
): string | null {
  if (remoteJid.endsWith("@s.whatsapp.net")) return onlyDigitsIfPhone(remoteJid);

  // deno-lint-ignore no-explicit-any
  const key: any = data.key ?? {};
  for (const cand of [
    key.senderPn,
    (data as { senderPn?: unknown }).senderPn,
    key.remoteJidAlt,
    (data as { remoteJidAlt?: unknown }).remoteJidAlt,
    key.previousRemoteJid,
  ]) {
    const d = onlyDigitsIfPhone(cand);
    if (d) return d;
  }
  return null;
}
