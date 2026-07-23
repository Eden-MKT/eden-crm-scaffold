import { TEAM_MEMBER_LABELS, teamAvatarUrl, type TeamMember } from "@/lib/team";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Avatarzinho de um membro da equipe (Filipe/João) com URL determinística
 * (team/<member>.jpg no bucket "avatars"). Cai na inicial se não houver foto.
 * Tamanho controlado por className (default h-5 w-5).
 */
export function TeamAvatar({
  member,
  className,
}: {
  member: Exclude<TeamMember, null>;
  className?: string;
}) {
  const label = TEAM_MEMBER_LABELS[member];
  return (
    <Avatar className={cn("h-5 w-5", className)}>
      <AvatarImage src={teamAvatarUrl(member)} alt={label} />
      <AvatarFallback className="bg-primary/15 text-[9px] font-medium text-primary">
        {label.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
