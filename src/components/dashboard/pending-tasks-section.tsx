import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Settings,
  UserX,
} from "lucide-react";

import { getPendingClientsForMember } from "@/lib/clients/pending";
import { ASSIGNEE_COLORS } from "@/lib/clients/stages";
import type { Client } from "@/lib/clients/types";
import type { TaskCompletion } from "@/lib/clients/task-queries";
import { isTeamConfigured, TEAM_EMAILS, TEAM_MEMBER_LABELS, type TeamMember } from "@/lib/team";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";

interface PendingTasksSectionProps {
  clients: Client[];
  completions: TaskCompletion[];
  member: TeamMember;
}

function WarningBanner({
  icon: Icon,
  title,
  description,
  hint,
}: {
  icon: typeof Settings;
  title: string;
  description: string;
  hint?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "relative overflow-hidden rounded-xl border-2 border-destructive/80",
        "bg-destructive/5 shadow-[0_0_0_1px_rgba(224,79,79,0.15),0_8px_24px_-8px_rgba(224,79,79,0.35)]",
      )}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-destructive" />
      <div className="flex gap-4 p-5 pl-6 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/15 ring-2 ring-destructive/30">
          <Icon className="h-5 w-5 text-destructive" aria-hidden />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-base font-semibold text-destructive">{title}</p>
          <p className="text-sm leading-relaxed text-foreground/90">{description}</p>
          {hint && (
            <p className="rounded-lg border border-destructive/20 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PendingTasksSection({ clients, completions, member }: PendingTasksSectionProps) {
  if (!isTeamConfigured()) {
    return (
      <FadeIn>
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ClipboardList className="h-4 w-4" />
            Suas pendências
          </h2>
          <WarningBanner
            icon={Settings}
            title="Equipe não configurada"
            description="O sistema ainda não consegue identificar quem é Filipe e quem é João. Sem isso, suas pendências personalizadas não aparecem aqui."
            hint="Peça ao administrador do projeto para configurar os e-mails da equipe no deploy."
          />
        </section>
      </FadeIn>
    );
  }

  if (!member) {
    return (
      <FadeIn>
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ClipboardList className="h-4 w-4" />
            Suas pendências
          </h2>
          <WarningBanner
            icon={UserX}
            title="E-mail não reconhecido"
            description="Seu e-mail de login não está vinculado a Filipe ou João. Entre com a conta correta da equipe."
            hint={`Contas válidas: ${TEAM_EMAILS.filipe} (Filipe) ou ${TEAM_EMAILS.joao} (João).`}
          />
        </section>
      </FadeIn>
    );
  }

  const pending = getPendingClientsForMember(clients, completions, member);
  const accent = ASSIGNEE_COLORS[member];

  return (
    <FadeIn>
      <Card
        className="surface-depth overflow-hidden border-2"
        style={{ borderColor: `${accent}55` }}
      >
        <CardHeader
          className="border-b pb-4"
          style={{ borderColor: `${accent}33`, backgroundColor: `${accent}0a` }}
        >
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${accent}22`, color: accent }}
              >
                <ClipboardList className="h-4 w-4" />
              </span>
              Suas pendências
            </span>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              {TEAM_MEMBER_LABELS[member]}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="flex items-center gap-3 px-6 py-8">
              <CheckCircle2 className="h-8 w-8 shrink-0" style={{ color: accent }} />
              <div>
                <p className="font-medium">Tudo em dia!</p>
                <p className="text-sm text-muted-foreground">
                  Nenhum cliente na sua etapa no momento.
                </p>
              </div>
            </div>
          ) : (
            <ul>
              {pending.map((item, index) => {
                const progress =
                  item.totalCount > 0
                    ? Math.round((item.completedCount / item.totalCount) * 100)
                    : 0;

                return (
                  <li
                    key={item.client.id}
                    className={cn(index > 0 && "border-t border-border/60")}
                  >
                    <Link
                      to="/clientes"
                      search={{ client: item.client.id, tab: "kanban" }}
                      className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-secondary/40"
                    >
                      <div
                        className="h-10 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium group-hover:text-primary">
                          {item.client.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.stageLabel}</p>
                        {item.totalCount > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${progress}%`, backgroundColor: accent }}
                              />
                            </div>
                            <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                              {item.completedCount}/{item.totalCount}
                            </span>
                          </div>
                        )}
                      </div>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </FadeIn>
  );
}
