import { useAuth } from "@/lib/auth";

export type TeamMember = "filipe" | "joao" | null;

const DEFAULT_FILIPE_EMAIL = "filipesenna59@gmail.com";
const DEFAULT_JOAO_EMAIL = "joaopaulorodrigues97@gmail.com";

const FILIPE_EMAIL = (
  import.meta.env.VITE_TEAM_FILIPE_EMAIL ?? DEFAULT_FILIPE_EMAIL
).toLowerCase();

const JOAO_EMAIL = (
  import.meta.env.VITE_TEAM_JOAO_EMAIL ?? DEFAULT_JOAO_EMAIL
).toLowerCase();

export const TEAM_MEMBER_LABELS: Record<Exclude<TeamMember, null>, string> = {
  filipe: "Filipe",
  joao: "João",
};

/** E-mails reconhecidos (para mensagens de ajuda). */
export const TEAM_EMAILS = {
  filipe: FILIPE_EMAIL,
  joao: JOAO_EMAIL,
} as const;

/** Resolve o membro da equipe a partir do e-mail de login. */
export function resolveTeamMember(email: string | null | undefined): TeamMember {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  if (normalized === FILIPE_EMAIL) return "filipe";
  if (normalized === JOAO_EMAIL) return "joao";
  return null;
}

export function useTeamMember(): TeamMember {
  const { user } = useAuth();
  return resolveTeamMember(user?.email);
}

export function isTeamConfigured(): boolean {
  return Boolean(FILIPE_EMAIL && JOAO_EMAIL);
}
