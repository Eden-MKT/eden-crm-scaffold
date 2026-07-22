// Tipos do painel de gestão (Éden) — shape do RPC markei_metrics (o nome do
// RPC é herdado do fork e mantido porque já existe no banco).

import type { LucideIcon } from "lucide-react";
import { Flame, Snowflake, Thermometer, TrendingUp } from "lucide-react";

import type { LeadTemperature, WhatsappConversation } from "@/lib/whatsapp/types";

export type Period = "today" | "week" | "month" | "year" | "all";

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  week: "Esta semana",
  month: "Este mês",
  year: "Este ano",
  all: "Tudo",
};

export interface MarkeiMetrics {
  ias: { ativas: number; total: number };
  conversas: number;
  mensagens: number;
  leadsNovos: { day: number; week: number; month: number };
  conversoes: number;
  taxaConversao: number;
  leadsDaily: { day: string; count: number }[];
  peakHours: { hour: number; count: number }[];
  tempoMedioRespostaSegundos: number | null;
  porAgente: MarkeiAgentSummary[];
  temperatureDistribution: { hot: number; warm: number; cold: number; unanalyzed: number };
  followupStats: { s0: number; s1: number; s2: number; s3: number };
  funnelDistribution: {
    novoContato: number;
    emAtendimento: number;
    qualificado: number;
    agendado: number;
    convertido: number;
  };
  probConversaoMedia: number | null;
  monthlyVolume: { month: string; leads: number; conversions: number }[];
  appointmentsUpcoming: { day: string; count: number }[];
}

export interface MarkeiAgentSummary {
  agentId: string;
  clientId: string;
  nome: string;
  status: string;
  phoneNumber: string | null;
  aiEnabled: boolean;
  conversas: number;
  conversasHoje: number;
}

// ---- Leads (tela Pacientes e Leads) ----

export type MarkeiLead = WhatsappConversation & { agentName: string };

export type LeadDerivedStatus = "novo" | "em_atendimento" | "respondeu" | "convertido";

/** Status derivado do lead (o papel markei não edita — vem da análise da IA). */
export function leadStatus(c: WhatsappConversation): LeadDerivedStatus {
  if (c.converted) return "convertido";
  if (c.leadStatus === "qualificado") return "respondeu";
  if (c.analyzedAt != null || c.leadStatus === "desqualificado") return "em_atendimento";
  return "novo";
}

export const LEAD_STATUS_META: Record<LeadDerivedStatus, { label: string; color: string }> = {
  novo: { label: "Novo", color: "var(--chart-2)" },
  em_atendimento: { label: "Em atendimento", color: "var(--warning)" },
  respondeu: { label: "Qualificado", color: "var(--success)" },
  convertido: { label: "Convertido", color: "var(--brand)" },
};

export type TemperatureKey = LeadTemperature | "unanalyzed";

export const TEMPERATURE_META: Record<
  TemperatureKey,
  { label: string; color: string; icon: LucideIcon }
> = {
  // Cores do design system: quente/morno usam os tons de alerta, frio o azul
  // dos gráficos e não-analisado o cinza neutro.
  hot: { label: "Quente", color: "var(--destructive)", icon: Flame },
  warm: { label: "Morno", color: "var(--warning)", icon: TrendingUp },
  cold: { label: "Frio", color: "var(--chart-2)", icon: Snowflake },
  unanalyzed: { label: "Não analisado", color: "var(--muted-foreground)", icon: Thermometer },
};

export const FUNNEL_STEPS = [
  "Novo Contato",
  "Em Atendimento",
  "Qualificado",
  "Agendado",
  "Finalizado",
] as const;
