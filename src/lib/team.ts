import { useAuth } from "@/lib/auth";

export type TeamMember = "filipe" | "joao" | null;

const FILIPE_EMAIL = (import.meta.env.VITE_TEAM_FILIPE_EMAIL as string | undefined)?.toLowerCase();
const JOAO_EMAIL = (import.meta.env.VITE_TEAM_JOAO_EMAIL as string | undefined)?.toLowerCase();

export const TEAM_MEMBER_LABELS: Record<Exclude<TeamMember, null>, string> = {
  filipe: "Filipe",
  joao: "João",
};

/** Resolve o membro da equipe a partir do e-mail de login. */
export function resolveTeamMember(email: string | null | undefined): TeamMember {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  if (FILIPE_EMAIL && normalized === FILIPE_EMAIL) return "filipe";
  if (JOAO_EMAIL && normalized === JOAO_EMAIL) return "joao";
  return null;
}

export function useTeamMember(): TeamMember {
  const { user } = useAuth();
  return resolveTeamMember(user?.email);
}

export function isTeamConfigured(): boolean {
  return Boolean(FILIPE_EMAIL && JOAO_EMAIL);
}
