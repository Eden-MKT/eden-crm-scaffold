// Camada de dados do Disparador (Fase 4). Leituras diretas nas tabelas via RLS
// staff (SELECT liberado). Escritas sensíveis (envio, status de campanha) vão
// pela Edge Function dispatch-admin — ver ./api.ts. Aqui ficam só leituras e
// escritas administrativas simples permitidas pela RLS (contatos, supressão
// append-only, criação de campanha rascunho + fila).
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type WaAccount = Database["public"]["Tables"]["wa_accounts"]["Row"];
export type WaTemplate = Database["public"]["Tables"]["wa_templates"]["Row"];
export type DispatchContact = Database["public"]["Tables"]["dispatch_contacts"]["Row"];
export type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
export type AuditRow = Database["public"]["Tables"]["dispatch_audit_log"]["Row"];

export const MESSAGING_LIMITS: Record<string, number> = {
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  UNLIMITED: Number.POSITIVE_INFINITY,
};

export const dispatchKeys = {
  all: ["dispatch"] as const,
  accounts: () => [...dispatchKeys.all, "accounts"] as const,
  monitor: () => [...dispatchKeys.all, "monitor"] as const,
  contacts: (page: number, search: string) =>
    [...dispatchKeys.all, "contacts", page, search] as const,
  contactStats: () => [...dispatchKeys.all, "contactStats"] as const,
  templates: () => [...dispatchKeys.all, "templates"] as const,
  campaigns: () => [...dispatchKeys.all, "campaigns"] as const,
  audit: (page: number) => [...dispatchKeys.all, "audit", page] as const,
  segments: () => [...dispatchKeys.all, "segments"] as const,
};

// ---------------------------------------------------------------------------
// Normalização E.164 BR — aceita com/sem +55 e com/sem o 9 do celular.
// ---------------------------------------------------------------------------
export function normalizeBR(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2); // insere o 9 do celular
  if (d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d[2] !== "9") return null; // celular BR: primeiro dígito do assinante é 9
  return "+55" + d;
}

// ---------------------------------------------------------------------------
// Parser CSV client-side (sem dependência). Trata aspas duplas e vírgula/;.
// ---------------------------------------------------------------------------
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Detecta delimitador na 1ª linha (vírgula ou ponto e vírgula).
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? src.length : src.indexOf("\n"));
  const delim = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Contas + consumo 24h (monitor).
// ---------------------------------------------------------------------------
export async function fetchAccounts(): Promise<WaAccount[]> {
  const { data, error } = await supabase
    .from("wa_accounts")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface AccountMonitor extends WaAccount {
  consumo24h: number;
}

export interface CampaignMonitor {
  campaign: Campaign;
  contaNome: string;
  fila: Record<string, number>;
  enviados: number;
  entregues: number;
  lidos: number;
  falhas: number;
  optOuts: number;
  optOutRate: number;
}

export interface MonitorData {
  accounts: AccountMonitor[];
  campaigns: CampaignMonitor[];
  hasRunning: boolean;
}

export async function fetchMonitor(): Promise<MonitorData> {
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const [accountsRes, campsRes, queueRes, logRes, optoutRes] = await Promise.all([
    supabase.from("wa_accounts").select("*").order("created_at", { ascending: true }),
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("dispatch_queue").select("campaign_id, status"),
    supabase.from("wa_message_log").select("campaign_id, wa_account_id, status, direcao, sent_at"),
    supabase.from("suppression_list").select("criado_em").eq("motivo", "opt_out"),
  ]);
  if (accountsRes.error) throw accountsRes.error;
  const accounts = accountsRes.data ?? [];
  const camps = campsRes.data ?? [];
  const queue = queueRes.data ?? [];
  const logs = logRes.data ?? [];
  const optOuts = (optoutRes.data ?? []).map((o) => new Date(o.criado_em).getTime());

  const accountMonitor: AccountMonitor[] = accounts.map((a) => ({
    ...a,
    consumo24h: logs.filter(
      (l) =>
        l.wa_account_id === a.id && l.direcao === "outbound" && l.sent_at && l.sent_at >= since24h,
    ).length,
  }));
  const contaNomeById = new Map(
    accounts.map((a) => [a.id, a.display_number || a.evolution_instance || a.provider]),
  );

  const campaignMonitor: CampaignMonitor[] = camps.map((c) => {
    const fila: Record<string, number> = {};
    for (const q of queue) {
      if (q.campaign_id === c.id) fila[q.status] = (fila[q.status] ?? 0) + 1;
    }
    const cLogs = logs.filter((l) => l.campaign_id === c.id && l.direcao === "outbound");
    const enviados = cLogs.length;
    const entregues = cLogs.filter((l) => ["delivered", "read"].includes(l.status ?? "")).length;
    const lidos = cLogs.filter((l) => l.status === "read").length;
    const falhas = cLogs.filter((l) => l.status === "failed").length;
    const disparadoTs = c.disparado_em ? new Date(c.disparado_em).getTime() : null;
    const optOutsCamp = disparadoTs === null ? 0 : optOuts.filter((t) => t >= disparadoTs).length;
    const optOutRate = enviados > 0 ? optOutsCamp / enviados : 0;
    return {
      campaign: c,
      contaNome: contaNomeById.get(c.wa_account_id) ?? "—",
      fila,
      enviados,
      entregues,
      lidos,
      falhas,
      optOuts: optOutsCamp,
      optOutRate,
    };
  });

  return {
    accounts: accountMonitor,
    campaigns: campaignMonitor,
    hasRunning: camps.some((c) => c.status === "rodando"),
  };
}

// ---------------------------------------------------------------------------
// Contatos.
// ---------------------------------------------------------------------------
export const CONTACTS_PER_PAGE = 25;

export interface ContactsPage {
  rows: DispatchContact[];
  total: number;
}

export async function fetchContacts(page: number, search: string): Promise<ContactsPage> {
  const from = page * CONTACTS_PER_PAGE;
  let q = supabase
    .from("dispatch_contacts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + CONTACTS_PER_PAGE - 1);
  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`telefone.ilike.${s},nome.ilike.${s},empresa.ilike.${s},nicho.ilike.${s}`);
  }
  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export interface ContactStats {
  total: number;
  optIn: number;
  contatados: number;
  suprimidos: number;
}

export async function fetchContactStats(): Promise<ContactStats> {
  const [total, optIn, contatados, suprimidos] = await Promise.all([
    supabase.from("dispatch_contacts").select("id", { count: "exact", head: true }),
    supabase
      .from("dispatch_contacts")
      .select("id", { count: "exact", head: true })
      .eq("opt_in", true),
    supabase
      .from("dispatch_contacts")
      .select("id", { count: "exact", head: true })
      .eq("contatado", true),
    supabase.from("suppression_list").select("id", { count: "exact", head: true }),
  ]);
  return {
    total: total.count ?? 0,
    optIn: optIn.count ?? 0,
    contatados: contatados.count ?? 0,
    suprimidos: suprimidos.count ?? 0,
  };
}

// Valores distintos de nicho/origem para os filtros de segmento.
export async function fetchSegments(): Promise<{ nichos: string[]; origens: string[] }> {
  const { data, error } = await supabase.from("dispatch_contacts").select("nicho, origem");
  if (error) throw error;
  const nichos = new Set<string>();
  const origens = new Set<string>();
  for (const r of data ?? []) {
    if (r.nicho) nichos.add(r.nicho);
    if (r.origem) origens.add(r.origem);
  }
  return { nichos: [...nichos].sort(), origens: [...origens].sort() };
}

export interface ImportRow {
  telefone: string;
  nome?: string;
  empresa?: string;
  nicho?: string;
  origem?: string;
  opt_in_source?: string;
}

export interface ImportResult {
  importados: number;
  duplicados: number;
  suprimidos: number;
  invalidos: { linha: number; valor: string; motivo: string }[];
}

// Importa contatos em lote: normaliza E.164, dedupe vs base e vs suppression.
export async function importContacts(raw: ImportRow[], baseLegal: string): Promise<ImportResult> {
  const result: ImportResult = { importados: 0, duplicados: 0, suprimidos: 0, invalidos: [] };

  // 1) Normaliza + valida.
  const valid: { tel: string; row: ImportRow }[] = [];
  const seen = new Set<string>();
  raw.forEach((r, i) => {
    const tel = normalizeBR(r.telefone ?? "");
    if (!tel) {
      result.invalidos.push({ linha: i + 2, valor: r.telefone ?? "", motivo: "telefone inválido" });
      return;
    }
    if (seen.has(tel)) {
      result.duplicados++;
      return;
    }
    seen.add(tel);
    valid.push({ tel, row: r });
  });

  const phones = valid.map((v) => v.tel);
  if (!phones.length) return result;

  // 2) Dedupe vs base e vs suppression (em blocos p/ não estourar o IN).
  const existing = new Set<string>();
  const suppressed = new Set<string>();
  for (let i = 0; i < phones.length; i += 500) {
    const chunk = phones.slice(i, i + 500);
    const [{ data: ex }, { data: sup }] = await Promise.all([
      supabase.from("dispatch_contacts").select("telefone").in("telefone", chunk),
      supabase.from("suppression_list").select("telefone").in("telefone", chunk),
    ]);
    for (const e of ex ?? []) existing.add(e.telefone);
    for (const s of sup ?? []) suppressed.add(s.telefone);
  }

  const toInsert = valid
    .filter((v) => {
      if (suppressed.has(v.tel)) {
        result.suprimidos++;
        return false;
      }
      if (existing.has(v.tel)) {
        result.duplicados++;
        return false;
      }
      return true;
    })
    .map((v) => ({
      telefone: v.tel,
      nome: v.row.nome || null,
      empresa: v.row.empresa || null,
      nicho: v.row.nicho || null,
      origem: v.row.origem || "import_csv",
      opt_in: true,
      opt_in_source: v.row.opt_in_source || "import_csv",
      opt_in_at: new Date().toISOString(),
      base_legal_lgpd: baseLegal,
    }));

  // 3) Insere em lotes de 500.
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error } = await supabase.from("dispatch_contacts").insert(chunk);
    if (error) throw error;
    result.importados += chunk.length;
  }
  return result;
}

export async function addContact(input: {
  telefone: string;
  nome?: string;
  empresa?: string;
  nicho?: string;
  origem?: string;
  baseLegal: string;
}): Promise<void> {
  const tel = normalizeBR(input.telefone);
  if (!tel) throw new Error("Telefone inválido (use formato BR).");
  const { error } = await supabase.from("dispatch_contacts").insert({
    telefone: tel,
    nome: input.nome || null,
    empresa: input.empresa || null,
    nicho: input.nicho || null,
    origem: input.origem || "manual",
    opt_in: true,
    opt_in_source: "manual",
    opt_in_at: new Date().toISOString(),
    base_legal_lgpd: input.baseLegal,
  });
  if (error) throw error;
}

// Suprime um contato — INSERT append-only em suppression_list. Nunca DELETE.
export async function suppressContact(telefone: string): Promise<void> {
  const { error } = await supabase
    .from("suppression_list")
    .insert({ telefone, motivo: "manual", origem: "painel" });
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
}

// ---------------------------------------------------------------------------
// Templates.
// ---------------------------------------------------------------------------
export async function fetchTemplates(): Promise<WaTemplate[]> {
  const { data, error } = await supabase
    .from("wa_templates")
    .select("*")
    .order("nome", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Campanhas — criação de rascunho + inserção da fila (o dry_run/launch vêm da
// Edge Function). Contagem do segmento e criação.
// ---------------------------------------------------------------------------
export interface SegmentFilter {
  nichos: string[];
  origens: string[];
}

// Ids de contatos elegíveis do segmento (sempre opt_in=true forçado).
async function segmentContactIds(filter: SegmentFilter): Promise<string[]> {
  let q = supabase.from("dispatch_contacts").select("id").eq("opt_in", true);
  if (filter.nichos.length) q = q.in("nicho", filter.nichos);
  if (filter.origens.length) q = q.in("origem", filter.origens);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

export async function countSegment(filter: SegmentFilter): Promise<number> {
  const ids = await segmentContactIds(filter);
  return ids.length;
}

export interface CreateCampaignInput {
  nome: string;
  waAccountId: string;
  templateId: string | null;
  corpoLivre: string | null;
  janelaInicio: number;
  janelaFim: number;
  capDiario: number;
  cooldownDias: number;
  filter: SegmentFilter;
}

// Cria a campanha em 'rascunho' e insere a fila (lotes de 500). Devolve o id.
export async function createCampaign(input: CreateCampaignInput): Promise<string> {
  const ids = await segmentContactIds(input.filter);
  if (!ids.length) throw new Error("Nenhum contato elegível no segmento selecionado.");

  const { data: user } = await supabase.auth.getUser();
  const { data: camp, error } = await supabase
    .from("campaigns")
    .insert({
      nome: input.nome,
      wa_account_id: input.waAccountId,
      template_id: input.templateId,
      corpo_livre: input.corpoLivre,
      status: "rascunho",
      janela_hora_inicio: input.janelaInicio,
      janela_hora_fim: input.janelaFim,
      cap_diario: input.capDiario,
      cooldown_dias: input.cooldownDias,
      criado_por: user.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const campaignId = camp.id;

  // Busca nome/empresa dos contatos p/ montar variables.
  const contactsById = new Map<string, { nome: string | null; empresa: string | null }>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data } = await supabase
      .from("dispatch_contacts")
      .select("id, nome, empresa")
      .in("id", chunk);
    for (const c of data ?? []) contactsById.set(c.id, { nome: c.nome, empresa: c.empresa });
  }

  const queueRows = ids.map((id) => {
    const c = contactsById.get(id);
    return {
      campaign_id: campaignId,
      contact_id: id,
      variables: { nome: c?.nome ?? "", empresa: c?.empresa ?? "" },
      status: "pendente" as const,
    };
  });
  for (let i = 0; i < queueRows.length; i += 500) {
    const chunk = queueRows.slice(i, i + 500);
    const { error: qErr } = await supabase.from("dispatch_queue").insert(chunk);
    if (qErr) throw qErr;
  }
  return campaignId;
}

// Exclui uma campanha em rascunho (cascade limpa a fila).
export async function deleteCampaign(campaignId: string): Promise<void> {
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("status", "rascunho");
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Auditoria.
// ---------------------------------------------------------------------------
export const AUDIT_PER_PAGE = 50;

export async function fetchAudit(page: number): Promise<{ rows: AuditRow[]; total: number }> {
  const from = page * AUDIT_PER_PAGE;
  const { data, count, error } = await supabase
    .from("dispatch_audit_log")
    .select("*", { count: "exact" })
    .order("criado_em", { ascending: false })
    .range(from, from + AUDIT_PER_PAGE - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
