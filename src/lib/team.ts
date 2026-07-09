import type { User } from "@supabase/supabase-js";

import { useAuth } from "@/lib/auth";

export type TeamMember = "filipe" | "joao" | null;

const DEFAULT_FILIPE_EMAIL = "filipesenna59@gmail.com";
const DEFAULT_JOAO_EMAILS = ["joaopaulorodrigues97@gmail.com", "joaopaulorodrigues97@hotmail.com"];

function parseEmailList(envValue: string | undefined, defaults: string[]): string[] {
  const raw = envValue ?? defaults.join(",");
  return [
    ...new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

const FILIPE_EMAILS = parseEmailList(import.meta.env.VITE_TEAM_FILIPE_EMAIL as string | undefined, [
  DEFAULT_FILIPE_EMAIL,
]);

const JOAO_EMAILS = parseEmailList(
  (import.meta.env.VITE_TEAM_JOAO_EMAILS as string | undefined) ??
    (import.meta.env.VITE_TEAM_JOAO_EMAIL as string | undefined),
  DEFAULT_JOAO_EMAILS,
);

export const TEAM_MEMBER_LABELS: Record<Exclude<TeamMember, null>, string> = {
  filipe: "Filipe",
  joao: "João",
};

/** Membros da equipe para seleção (ex.: responsável de um compromisso). */
export const TEAM_MEMBERS: { key: Exclude<TeamMember, null>; label: string; email: string }[] = [
  { key: "filipe", label: "Filipe", email: FILIPE_EMAILS[0] ?? DEFAULT_FILIPE_EMAIL },
  { key: "joao", label: "João", email: JOAO_EMAILS[0] ?? DEFAULT_JOAO_EMAILS[0] },
];

/** Rótulo amigável de um email da equipe (ou o próprio email se desconhecido). */
export function teamLabelForEmail(email: string): string {
  const member = resolveTeamMember(email);
  return member ? TEAM_MEMBER_LABELS[member] : email;
}

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

/**
 * É usuário da equipe (staff = acesso ao CRM)? True se o e-mail está na lista
 * OU se app_metadata.role === 'super_admin'. Usado só para roteamento — a
 * segurança real dos dados é garantida por RLS (is_staff) + edge functions.
 */
export function isStaffUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  if (role === "super_admin") return true;
  return resolveTeamMember(user.email) !== null;
}

/** É um usuário do portal do cliente (não-staff, mapeado a um cliente)? */
export function isPortalClientUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  return role === "client" || !isStaffUser(user);
}

export function isTeamConfigured(): boolean {
  return FILIPE_EMAILS.length > 0 && JOAO_EMAILS.length > 0;
}
