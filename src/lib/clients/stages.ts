// Etapas do cliente — fonte única de verdade (Kanban, métricas, badges).
export type Stage =
  | "onboarding"
  | "estrategia"
  | "aguardando_dados"
  | "executando_estrategia"
  | "manutencao"
  | "churn";

export interface StageConfig {
  id: Stage;
  label: string;
  short: string;
  /** Cor (hex) usada em gráficos e indicadores. */
  color: string;
}

export const STAGES: StageConfig[] = [
  { id: "onboarding", label: "Onboarding", short: "Onboarding", color: "#3AA0FF" },
  {
    id: "estrategia",
    label: "Planejamento de Estratégia",
    short: "Estratégia",
    color: "#1F4FD6",
  },
  {
    id: "aguardando_dados",
    label: "Aguardando Dados",
    short: "Aguardando",
    color: "#E0A52F",
  },
  {
    id: "executando_estrategia",
    label: "Executando Estratégia",
    short: "Executando",
    color: "#14B8A6",
  },
  { id: "manutencao", label: "Manutenção", short: "Manutenção", color: "#2FB67C" },
  {
    id: "churn",
    label: "Contrato Encerrado / Churn",
    short: "Churn",
    color: "#E04F4F",
  },
];

export const STAGE_IDS = STAGES.map((s) => s.id);

export const STAGE_MAP: Record<Stage, StageConfig> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
) as Record<Stage, StageConfig>;

export function isStage(value: string): value is Stage {
  return (STAGE_IDS as string[]).includes(value);
}

/** Etapas consideradas "ativas" (exclui churn). */
export const ACTIVE_STAGES: Stage[] = [
  "onboarding",
  "estrategia",
  "aguardando_dados",
  "executando_estrategia",
  "manutencao",
];
