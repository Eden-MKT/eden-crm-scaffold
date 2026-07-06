export interface PortalWindow {
  atendimentos: number;
  leads: number;
}

export interface PortalMetrics {
  agentConnected: boolean;
  totals: {
    conversations: number;
    converted: number;
    conversionRate: number;
    messages: number;
  };
  windows: {
    day?: PortalWindow;
    week?: PortalWindow;
    month?: PortalWindow;
  };
  peakHours: { hour: number; count: number }[];
  topTopics: { topic: string; count: number }[];
  leadsDaily: { day: string; count: number }[];
}

export interface PortalData {
  client: { name: string; company: string | null } | null;
  metrics: PortalMetrics;
}
