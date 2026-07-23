export interface PortalWindow {
  atendimentos: number;
  leads: number;
}

export interface PortalMetrics {
  agentConnected: boolean;
  agendaEnabled: boolean;
  totals: {
    conversations: number;
    converted: number;
    conversionRate: number;
    messages: number;
  };
  appointments: {
    total: number;
    scheduled: number;
    completed: number;
    noShow: number;
  };
  windows: {
    day?: PortalWindow;
    week?: PortalWindow;
    month?: PortalWindow;
  };
  peakHours: { hour: number; count: number }[];
  topTopics: { topic: string; count: number }[];
  leadsDaily: { day: string; count: number }[];
  // ---- Campos novos do portal_metrics (opcionais: a edge pode estar defasada) ----
  temperatureDistribution?: { hot: number; warm: number; cold: number; unanalyzed: number };
  followupStats?: { s0: number; s1: number; s2: number; s3: number };
  funnelDistribution?: {
    novoContato: number;
    emAtendimento: number;
    qualificado: number;
    agendado: number;
    convertido: number;
  };
  probConversaoMedia?: number | null;
  monthlyVolume?: { month: string; leads: number; conversions: number }[];
  appointmentsUpcoming?: { day: string; count: number }[];
  tempoMedioRespostaSegundos?: number | null;
}

export interface PortalData {
  client: { name: string; company: string | null } | null;
  metrics: PortalMetrics;
}
