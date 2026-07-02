// Etapas do cliente — fonte única de verdade (Kanban, métricas, badges).
import type { TeamMember } from "@/lib/team";

export type Stage =
  | "kickoff"
  | "site_infra"
  | "tracking_dados"
  | "crm_integracoes"
  | "pesquisa_planejamento"
  | "criativos"
  | "estrutura_campanha"
  | "gestao_continua"
  | "relatorios_bi"
  | "otimizacao_escala"
  | "manutencao"
  | "churn";

/** Cores fixas por responsável no kanban. */
export const ASSIGNEE_COLORS: Record<Exclude<TeamMember, null>, string> = {
  filipe: "#E04F4F",
  joao: "#2FB67C",
};

export const NEUTRAL_STAGE_COLOR = "#94A3B8";

export interface StageConfig {
  id: Stage;
  label: string;
  short: string;
  /** Responsável pela etapa (define cor do card). */
  assignee: TeamMember;
  /** Cor usada em gráficos e indicadores (derivada do responsável). */
  color: string;
}

function stageColor(assignee: TeamMember): string {
  if (!assignee) return NEUTRAL_STAGE_COLOR;
  return ASSIGNEE_COLORS[assignee];
}

export const STAGES: StageConfig[] = [
  {
    id: "kickoff",
    label: "Kickoff & Onboarding",
    short: "Kickoff",
    assignee: "joao",
    color: stageColor("joao"),
  },
  {
    id: "site_infra",
    label: "Site & Infraestrutura",
    short: "Site",
    assignee: "filipe",
    color: stageColor("filipe"),
  },
  {
    id: "tracking_dados",
    label: "Tracking & Dados",
    short: "Tracking",
    assignee: "filipe",
    color: stageColor("filipe"),
  },
  {
    id: "crm_integracoes",
    label: "CRM & Integrações",
    short: "CRM",
    assignee: "filipe",
    color: stageColor("filipe"),
  },
  {
    id: "pesquisa_planejamento",
    label: "Pesquisa & Planejamento",
    short: "Pesquisa",
    assignee: "joao",
    color: stageColor("joao"),
  },
  {
    id: "criativos",
    label: "Social & Criativos",
    short: "Criativos",
    assignee: "filipe",
    color: stageColor("filipe"),
  },
  {
    id: "estrutura_campanha",
    label: "Estrutura de Campanha",
    short: "Campanha",
    assignee: "joao",
    color: stageColor("joao"),
  },
  {
    id: "gestao_continua",
    label: "Gestão Contínua",
    short: "Gestão",
    assignee: "joao",
    color: stageColor("joao"),
  },
  {
    id: "relatorios_bi",
    label: "Relatórios & BI",
    short: "Relatórios",
    assignee: "filipe",
    color: stageColor("filipe"),
  },
  {
    id: "otimizacao_escala",
    label: "Otimização & Escala",
    short: "Otimização",
    assignee: "joao",
    color: stageColor("joao"),
  },
  {
    id: "manutencao",
    label: "Manutenção",
    short: "Manutenção",
    assignee: "joao",
    color: stageColor("joao"),
  },
  {
    id: "churn",
    label: "Contrato Encerrado / Churn",
    short: "Churn",
    assignee: null,
    color: stageColor(null),
  },
];

export const STAGE_IDS = STAGES.map((s) => s.id);

export const STAGE_MAP: Record<Stage, StageConfig> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
) as Record<Stage, StageConfig>;

export function isStage(value: string): value is Stage {
  return (STAGE_IDS as string[]).includes(value);
}

/** Cor do card conforme responsável da etapa atual. */
export function stageAssigneeColor(stage: Stage): string {
  return STAGE_MAP[stage]?.color ?? NEUTRAL_STAGE_COLOR;
}

/** Etapas consideradas "ativas" (exclui churn). */
export const ACTIVE_STAGES: Stage[] = [
  "kickoff",
  "site_infra",
  "tracking_dados",
  "crm_integracoes",
  "pesquisa_planejamento",
  "criativos",
  "estrutura_campanha",
  "gestao_continua",
  "relatorios_bi",
  "otimizacao_escala",
  "manutencao",
];

/** Filtra clientes cuja etapa atual é responsabilidade do membro. */
export function isStageOwnedBy(stage: Stage, member: TeamMember): boolean {
  if (!member) return false;
  return STAGE_MAP[stage]?.assignee === member;
}
