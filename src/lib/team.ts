import { useAuth } from "@/lib/auth";

export type TeamMember = "filipe" | "joao" | null;

const DEFAULT_FILIPE_EMAIL = "filipesenna59@gmail.com";
const DEFAULT_JOAO_EMAILS = [
  "joaopaulorodrigues97@gmail.com",
  "joaopaulorodrigues97@hotmail.com",
];

function parseEmailList(envValue: string | undefined, defaults: string[]): string[] {
  const raw = envValue ?? defaults.join(",");
  return [...new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

const FILIPE_EMAILS = parseEmailList(
  import.meta.env.VITE_TEAM_FILIPE_EMAIL as string | undefined,
  [DEFAULT_FILIPE_EMAIL],
);

const JOAO_EMAILS = parseEmailList(
  (import.meta.env.VITE_TEAM_JOAO_EMAILS as string | undefined) ??
    (import.meta.env.VITE_TEAM_JOAO_EMAIL as string | undefined),
  DEFAULT_JOAO_EMAILS,
);

export const TEAM_MEMBER_LABELS: Record<Exclude<TeamMember, null>, string> = {
  filipe: "Filipe",
  joao: "João",
};

/** E-mails reconhecidos (para mensagens de ajuda). */
export const TEAM_EMAILS = {
  filipe: FILIPE_EMAILS.join(" ou "),
  joao: JOAO_EMAILS.join(" ou "),
} as const;

function isInList(email: string, list: string[]): boolean {
  return list.includes(email.toLowerCase().trim());
}

/** Resolve o membro da equipe a partir do e-mail de login. */
export function resolveTeamMember(email: string | null | undefined): TeamMember {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  if (isInList(normalized, FILIPE_EMAILS)) return "filipe";
  if (isInList(normalized, JOAO_EMAILS)) return "joao";
  return null;
}

export function useTeamMember(): TeamMember {
  const { user } = useAuth();
  return resolveTeamMember(user?.email);
}

export function isTeamConfigured(): boolean {
  return FILIPE_EMAILS.length > 0 && JOAO_EMAILS.length > 0;
}
