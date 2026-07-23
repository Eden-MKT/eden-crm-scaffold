import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Loader2,
  MessagesSquare,
  Phone,
  Search,
  Settings,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { fetchMarkeiMetrics, markeiKeys } from "@/lib/markei/queries";
import type { MarkeiAgentSummary } from "@/lib/markei/types";
import { ensureAgent, setAgentAiEnabled } from "@/lib/whatsapp/queries";
import type { AgentStatus, WhatsappAgent } from "@/lib/whatsapp/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import { Switch } from "@/components/ui/switch";
import { AgentSettingsSheet } from "@/components/whatsapp/agent-settings-sheet";
import { ConnectionBadge } from "@/components/whatsapp/status-badge";
import { MetricCard } from "./metric-card";

function asStatus(status: string): AgentStatus | "none" {
  return status === "connected" || status === "connecting" || status === "disconnected"
    ? status
    : "none";
}

// Cor da saúde da conexão — mesma leitura do badge, usada no ponto do avatar
// e no brilho do card para o estado ser percebido antes da leitura.
const STATUS_TONE: Record<AgentStatus | "none", string> = {
  connected: "var(--success)",
  connecting: "var(--warning)",
  disconnected: "var(--destructive)",
  none: "var(--muted-foreground)",
};

function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? singular : plural_;
}

// "Minhas IAs" — cards dos médicos/IAs. Visualização + liga/desliga
// da IA (única escrita permitida em whatsapp_agents para o papel markei).
export function MarkeiIas() {
  const [q, setQ] = useState("");

  // Sheet de configuração: o summary local não é o WhatsappAgent completo,
  // então buscamos o agente via ensureAgent(clientId) ao clicar em Configurar.
  const [configAgent, setConfigAgent] = useState<{
    agent: WhatsappAgent;
    clientName: string;
  } | null>(null);

  const configMutation = useMutation({
    mutationFn: async (a: MarkeiAgentSummary) => ({
      agent: await ensureAgent(a.clientId),
      clientName: a.nome,
    }),
    onSuccess: (data) => setConfigAgent(data),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao abrir as configurações da IA."),
  });

  const { data: m, isLoading } = useQuery({
    queryKey: markeiKeys.metrics(),
    queryFn: () => fetchMarkeiMetrics(),
    refetchInterval: 60_000,
  });

  const agents = m?.porAgente ?? [];
  const filtered = agents.filter(
    (a) =>
      a.nome.toLowerCase().includes(q.toLowerCase()) || (a.phoneNumber ?? "").includes(q.trim()),
  );

  const total = agents.length;
  const operational = agents.filter((a) => a.status === "connected").length;
  const connecting = agents.filter((a) => a.status === "connecting").length;
  const offline = total - operational - connecting;

  const aiOn = agents.filter((a) => a.aiEnabled).length;
  const paused = total - aiOn;
  const conversasHoje = agents.reduce((s, a) => s + a.conversasHoje, 0);
  const conversasTotal = agents.reduce((s, a) => s + a.conversas, 0);

  // Subtítulo conta o estado real da operação, não um texto decorativo.
  const subtitle = isLoading
    ? "Carregando seus assistentes…"
    : total === 0
      ? "Nenhum assistente conectado ainda"
      : `${operational} de ${total} ${plural(total, "assistente conectado", "assistentes conectados")}` +
        (paused > 0 ? ` · ${paused} com a IA pausada` : "");

  // Só aparece quando há algo para olhar — sem alarme falso no estado saudável.
  const alert =
    offline > 0
      ? {
          tone: "var(--destructive)",
          icon: <AlertTriangle className="h-4 w-4" />,
          title: `${offline} ${plural(offline, "assistente fora do ar", "assistentes fora do ar")}`,
          description:
            "Enquanto a conexão não voltar, as mensagens não chegam até a IA e ficam sem resposta.",
        }
      : connecting > 0
        ? {
            tone: "var(--warning)",
            icon: <Loader2 className="h-4 w-4 animate-spin" />,
            title: `${connecting} ${plural(connecting, "assistente reconectando", "assistentes reconectando")}`,
            description: "A conexão está sendo restabelecida — deve normalizar em instantes.",
          }
        : null;

  return (
    <main className="mx-auto h-full max-w-6xl space-y-6 overflow-y-auto p-4 pb-8 md:p-6">
      <PageHeader
        title="Minhas IAs"
        subtitle={subtitle}
        action={
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou número…"
              className="pl-8"
            />
          </div>
        }
      />

      {isLoading ? (
        <IasSkeleton />
      ) : (
        <>
          {total > 0 && (
            <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StaggerItem>
                <MetricCard
                  label="Conectados"
                  value={operational}
                  hint={`de ${total} ${plural(total, "assistente", "assistentes")} no WhatsApp`}
                  tone="success"
                  icon={<Wifi className="h-4 w-4" />}
                  share={(operational / total) * 100}
                  emphasis
                />
              </StaggerItem>
              <StaggerItem>
                <MetricCard
                  label="Com a IA ligada"
                  value={aiOn}
                  hint={
                    paused > 0
                      ? `${paused} ${plural(paused, "está pausado", "estão pausados")} agora`
                      : "todos respondendo automaticamente"
                  }
                  tone="brand"
                  icon={<Bot className="h-4 w-4" />}
                  share={(aiOn / total) * 100}
                  emphasis
                />
              </StaggerItem>
              <StaggerItem>
                <MetricCard
                  label="Conversas hoje"
                  value={conversasHoje}
                  hint={`${conversasTotal} ${plural(conversasTotal, "atendimento", "atendimentos")} desde o início`}
                  tone="info"
                  icon={<MessagesSquare className="h-4 w-4" />}
                  emphasis
                />
              </StaggerItem>
            </Stagger>
          )}

          {alert && (
            <div
              className="flex items-start gap-3 rounded-xl border p-3.5"
              style={{
                borderColor: `color-mix(in oklab, ${alert.tone} 32%, transparent)`,
                background: `color-mix(in oklab, ${alert.tone} 7%, transparent)`,
              }}
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: `color-mix(in oklab, ${alert.tone} 18%, transparent)`,
                  color: alert.tone,
                }}
              >
                {alert.icon}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{alert.description}</p>
              </div>
            </div>
          )}

          {total === 0 && (
            <EmptyState
              title="Nenhum assistente por aqui ainda"
              description="Assim que uma IA for conectada ao WhatsApp da clínica, ela aparece nesta tela com o status da conexão."
            />
          )}

          {total > 0 && filtered.length === 0 && (
            <EmptyState
              title={`Nada encontrado para “${q.trim()}”`}
              description="Confira o nome do assistente ou tente buscar pelo número do WhatsApp."
              action={
                <Button variant="outline" size="sm" onClick={() => setQ("")}>
                  Limpar busca
                </Button>
              }
            />
          )}

          {filtered.length > 0 && (
            <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((a) => (
                <StaggerItem key={a.agentId}>
                  <AgentCard
                    agent={a}
                    configuring={
                      configMutation.isPending && configMutation.variables?.agentId === a.agentId
                    }
                    onConfigure={() => configMutation.mutate(a)}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </>
      )}

      {configAgent && (
        <AgentSettingsSheet
          agent={configAgent.agent}
          clientName={configAgent.clientName}
          open
          onOpenChange={(open) => {
            if (!open) setConfigAgent(null);
          }}
        />
      )}
    </main>
  );
}

function IasSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

/** Estado vazio que explica o que fazer, em vez de só dizer "nenhum registro". */
function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Bot className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

function AgentCard({
  agent,
  configuring,
  onConfigure,
}: {
  agent: MarkeiAgentSummary;
  configuring: boolean;
  onConfigure: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const status = asStatus(agent.status);
  const tone = STATUS_TONE[status];

  const aiMutation = useMutation({
    mutationFn: () => setAgentAiEnabled(agent.agentId, !agent.aiEnabled),
    onSuccess: () => {
      toast.success(agent.aiEnabled ? "IA desativada." : "IA ativada.");
      queryClient.invalidateQueries({ queryKey: markeiKeys.all });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar a IA."),
  });

  return (
    <Card className="surface-depth surface-depth-hover group relative h-full overflow-hidden">
      {/* Brilho na cor da conexão — a saúde do agente se lê antes do texto. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full opacity-[0.16] blur-2xl transition-opacity duration-300 group-hover:opacity-30"
        style={{ background: tone }}
      />

      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-3">
        <span className="relative shrink-0">
          <Avatar className="h-11 w-11">
            <AvatarFallback className="bg-primary/15 text-sm font-medium text-primary">
              {agent.nome.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span
            aria-hidden="true"
            className={
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card " +
              (status === "connecting" ? "animate-pulse" : "")
            }
            style={{ background: tone }}
          />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold leading-tight">{agent.nome}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate tabular-nums">
              {agent.phoneNumber ?? "Número não configurado"}
            </span>
          </p>
          <div className="pt-0.5">
            <ConnectionBadge status={status} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[11px] leading-none text-muted-foreground">Conversas hoje</p>
            <p className="mt-1.5 text-lg font-semibold leading-none tabular-nums">
              {agent.conversasHoje}
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[11px] leading-none text-muted-foreground">Pacientes atendidos</p>
            <p className="mt-1.5 text-lg font-semibold leading-none tabular-nums">
              {agent.conversas}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <div className="min-w-0">
            <p className="text-xs font-medium">
              {agent.aiEnabled ? "IA respondendo" : "IA pausada"}
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {agent.aiEnabled
                ? "Responde sozinha as novas mensagens"
                : "As mensagens ficam esperando atendimento"}
            </p>
          </div>
          <Switch
            checked={agent.aiEnabled}
            disabled={aiMutation.isPending}
            onCheckedChange={() => setConfirmOpen(true)}
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={configuring}
          onClick={onConfigure}
        >
          {configuring ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Settings className="mr-1.5 h-4 w-4" />
          )}
          Configurar
        </Button>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {agent.aiEnabled
                ? `Desativar a IA de ${agent.nome}?`
                : `Ativar a IA de ${agent.nome}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {agent.aiEnabled
                ? "A IA deixará de responder TODAS as conversas deste assistente até ser reativada."
                : "A IA voltará a responder automaticamente as conversas deste assistente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => aiMutation.mutate()}>
              {agent.aiEnabled ? "Desativar IA" : "Ativar IA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
