import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Ban, BellRing, CheckCircle2, Hourglass, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";

import { fetchAutoFollowups } from "@/lib/markei/leads";
import { fetchMarkeiMetrics, markeiKeys } from "@/lib/markei/queries";
import {
  fetchManualFollowUps,
  setManualFollowUpStatus,
  type ManualFollowUp,
} from "@/lib/whatsapp/queries";
import { contactLabel, type WhatsappConversation } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard, type MetricTone } from "./metric-card";
import { FollowupCreateDialog } from "./followup-create-dialog";

const HOUR = 3_600_000;

/** Tom neutro para o que saiu da cadência — não é bom nem ruim, é "acabou". */
const NEUTRAL = "var(--muted-foreground)";

const STAGE_META: Record<number, { label: string; color: string }> = {
  0: { label: "Antes do 1º lembrete", color: "var(--chart-2)" },
  1: { label: "1º lembrete enviado", color: "var(--warning)" },
  2: { label: "2º lembrete enviado", color: "var(--destructive)" },
  3: { label: "Cadência esgotada", color: NEUTRAL },
};

const MANUAL_STATUS_META: Record<ManualFollowUp["status"], { label: string; color: string }> = {
  pending: { label: "Pendente", color: "var(--chart-2)" },
  sending: { label: "Enviando", color: "var(--warning)" },
  sent: { label: "Enviado", color: "var(--success)" },
  cancelled: { label: "Cancelado", color: NEUTRAL },
  failed: { label: "Falhou", color: "var(--destructive)" },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function pillStyle(color: string) {
  return {
    color,
    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in oklab, ${color} 32%, transparent)`,
  };
}

/** Horário do próximo follow-up automático conforme o estágio. */
function nextFollowupAt(c: WhatsappConversation): Date | null {
  if (c.followupStage === 0) {
    return c.lastMessageAt ? new Date(new Date(c.lastMessageAt).getTime() + 12 * HOUR) : null;
  }
  if (c.followupStage === 1) {
    return c.lastFollowupAt ? new Date(new Date(c.lastFollowupAt).getTime() + 24 * HOUR) : null;
  }
  if (c.followupStage === 2) {
    return c.lastFollowupAt ? new Date(new Date(c.lastFollowupAt).getTime() + 48 * HOUR) : null;
  }
  return null;
}

function Countdown({ target, now }: { target: Date | null; now: number }) {
  if (!target) return <span className="text-muted-foreground">—</span>;
  const diff = target.getTime() - now;
  if (diff <= 0) {
    return <span className="animate-pulse font-medium text-success">Saindo agora</span>;
  }
  const days = Math.floor(diff / (24 * HOUR));
  const hours = Math.floor((diff % (24 * HOUR)) / HOUR);
  const minutes = Math.floor((diff % HOUR) / 60_000);
  // Menos de uma hora já merece destaque — é o que sai a seguir.
  const soon = diff < HOUR;
  return (
    <span
      className={cn("tabular-nums", soon ? "font-medium text-warning" : "text-muted-foreground")}
    >
      {days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}min`}
    </span>
  );
}

/** Linhas fantasma enquanto a tabela carrega — melhor que um "Carregando…". */
function TableSkeleton({ cols, rows = 4 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j} className={j === 0 ? "pl-4" : undefined}>
              <div className="h-4 animate-pulse rounded bg-muted" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Estado vazio que explica o que fazer, em vez de só avisar que está vazio. */
function EmptyRow({ cols, title, hint }: { cols: number; title: string; hint: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={cols} className="py-10 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      </TableCell>
    </TableRow>
  );
}

/**
 * Faixa de contexto para quem já saiu da cadência: a IA não tenta mais, então
 * a próxima ação é humana. Sempre visível para não esconder o problema.
 */
function ExhaustedStrip({ count }: { count: number }) {
  return (
    <Card className="surface-depth surface-depth-hover">
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in oklab, ${NEUTRAL} 18%, transparent)`,
            color: NEUTRAL,
          }}
        >
          <Ban className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          {count > 0 ? (
            <>
              <p className="text-sm font-medium">
                <span className="tabular-nums">{count}</span>{" "}
                {count === 1 ? "lead esgotou a cadência" : "leads esgotaram a cadência"}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                A IA já enviou todos os lembretes. Daqui em diante o contato precisa ser humano.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Nenhum lead esgotou a cadência</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Todo mundo que parou de responder ainda tem lembrete a receber.
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Follow-ups — cadência automática (visão em tempo quase real) + agendamentos
// manuais (papel markei tem ALL em follow_ups via RLS).
export function MarkeiFollowups() {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ManualFollowUp | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick de 30s para os countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: markeiKeys.metrics(),
    queryFn: () => fetchMarkeiMetrics(),
    refetchInterval: 60_000,
  });
  const agents = metrics?.porAgente ?? [];
  const agentName = useMemo(() => new Map(agents.map((a) => [a.agentId, a.nome])), [agents]);
  const stats = metrics?.followupStats;

  const { data: autoRows, isLoading: loadingAuto } = useQuery({
    queryKey: markeiKeys.autoFollowups(),
    queryFn: fetchAutoFollowups,
    refetchInterval: 60_000,
  });
  const autoFiltered = (autoRows ?? []).filter((c) => agentId === "all" || c.agentId === agentId);

  const { data: manualRows, isLoading: loadingManual } = useQuery({
    queryKey: markeiKeys.manualFollowups(),
    queryFn: () => fetchManualFollowUps(),
    refetchInterval: 60_000,
  });
  const manual = manualRows ?? [];
  const manualCounts = manual.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "sent" | "cancelled" }) =>
      setManualFollowUpStatus(id, status),
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "sent" ? "Marcado como enviado." : "Follow-up cancelado.");
      queryClient.invalidateQueries({ queryKey: markeiKeys.manualFollowups() });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar."),
  });

  const s0 = stats?.s0 ?? 0;
  const s1 = stats?.s1 ?? 0;
  const s2 = stats?.s2 ?? 0;
  const s3 = stats?.s3 ?? 0;
  // Quem ainda vai receber alguma coisa da IA.
  const aguardando = s0 + s1 + s2;

  // Os que já passaram da hora — é o que sai na próxima rodada.
  const prontosParaSair = autoFiltered.filter((c) => {
    const next = nextFollowupAt(c);
    return next != null && next.getTime() <= now;
  }).length;

  const share = (v: number) => (aguardando > 0 ? (v / aguardando) * 100 : 0);

  // Cor cresce com a urgência: azul → âmbar → vermelho conforme a IA insiste.
  const stageCards: {
    label: string;
    value: number;
    hint: string;
    tone: MetricTone;
    icon: React.ReactNode;
    share: number;
    emphasis: boolean;
  }[] = [
    {
      label: "Aguardando 12h",
      value: s0,
      hint: "antes do primeiro lembrete",
      tone: "info",
      icon: <Hourglass className="h-4 w-4" />,
      share: share(s0),
      emphasis: true,
    },
    {
      label: "Aguardando 24h",
      value: s1,
      hint: "já receberam o primeiro lembrete",
      tone: "warning",
      icon: <BellRing className="h-4 w-4" />,
      share: share(s1),
      emphasis: true,
    },
    {
      label: "Aguardando 48h",
      value: s2,
      hint: "última tentativa da IA",
      tone: "danger",
      icon: <AlarmClock className="h-4 w-4" />,
      share: share(s2),
      emphasis: true,
    },
  ];

  const filaSubtitle = (() => {
    if (loadingAuto) return "carregando a fila…";
    if (autoFiltered.length === 0) {
      return agentId === "all" ? "nenhum lead na fila agora" : "nenhum lead na fila desta IA";
    }
    const base = `${autoFiltered.length} ${autoFiltered.length === 1 ? "lead" : "leads"} em cadência`;
    return prontosParaSair > 0 ? `${base} · ${prontosParaSair} prontos para sair` : base;
  })();

  return (
    <main className="mx-auto h-full max-w-6xl space-y-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        title="Follow-ups"
        subtitle={
          // Sem métricas ainda, `aguardando` é 0 — não afirmar "nenhum lead" antes de saber.
          loadingMetrics
            ? "Verificando a cadência automática…"
            : aguardando > 0
              ? `${aguardando} ${aguardando === 1 ? "lead aguardando" : "leads aguardando"} o retorno automático da IA`
              : "Nenhum lead aguardando retorno no momento"
        }
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Agendar follow-up
          </Button>
        }
      />

      <Tabs defaultValue="auto" className="space-y-5">
        <TabsList>
          <TabsTrigger value="auto">Automáticos</TabsTrigger>
          <TabsTrigger value="manual">Manuais</TabsTrigger>
        </TabsList>

        {/* ---- Automáticos ---- */}
        <TabsContent value="auto" className="space-y-5">
          {loadingMetrics ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (
            <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {stageCards.map((c) => (
                <StaggerItem key={c.label}>
                  <MetricCard {...c} />
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {loadingMetrics ? (
            <div className="h-[72px] animate-pulse rounded-xl bg-muted" />
          ) : (
            <ExhaustedStrip count={s3} />
          )}

          <Card className="surface-depth">
            <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-sm">Fila de lembretes</CardTitle>
                <p className="text-xs text-muted-foreground">{filaSubtitle}</p>
              </div>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="h-9 w-full sm:w-52">
                  <SelectValue placeholder="IA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as IAs</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.agentId} value={a.agentId}>
                      {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Lead</TableHead>
                    <TableHead className="hidden md:table-cell">IA</TableHead>
                    <TableHead>Estágio</TableHead>
                    <TableHead className="hidden lg:table-cell">Última mensagem</TableHead>
                    <TableHead className="hidden md:table-cell">Próximo lembrete</TableHead>
                    <TableHead>Faltam</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAuto && <TableSkeleton cols={6} />}
                  {!loadingAuto && autoFiltered.length === 0 && (
                    <EmptyRow
                      cols={6}
                      title={
                        agentId === "all"
                          ? "Nenhum lead esperando lembrete"
                          : "Nenhum lead desta IA na fila"
                      }
                      hint={
                        agentId === "all"
                          ? "Quando um lead parar de responder, a IA entra com os lembretes automáticos e ele aparece aqui."
                          : "Troque o filtro para ver os leads em cadência das outras IAs."
                      }
                    />
                  )}
                  {autoFiltered.map((c) => {
                    const stage = STAGE_META[Math.min(c.followupStage, 3)] ?? STAGE_META[0];
                    const next = nextFollowupAt(c);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="pl-4">
                          <p className="font-medium">{contactLabel(c)}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.remoteJid.split("@")[0]}
                          </p>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {agentName.get(c.agentId) ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold"
                            style={pillStyle(stage.color)}
                          >
                            {stage.label}
                          </span>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                          {formatDateTime(c.lastMessageAt)}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                          {next ? formatDateTime(next.toISOString()) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <Countdown target={next} now={now} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Manuais ---- */}
        <TabsContent value="manual" className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(MANUAL_STATUS_META) as ManualFollowUp["status"][]).map((s) => {
              const meta = MANUAL_STATUS_META[s];
              const count = manualCounts[s] ?? 0;
              return (
                <span
                  key={s}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-border/70 px-3 py-1.5 text-xs transition-opacity",
                    count === 0 && "opacity-60",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: meta.color }}
                  />
                  <span className="text-muted-foreground">{meta.label}</span>
                  <span className="font-semibold tabular-nums" style={{ color: meta.color }}>
                    {count}
                  </span>
                </span>
              );
            })}
          </div>

          <Card className="surface-depth">
            <CardHeader className="space-y-0.5 pb-3">
              <CardTitle className="text-sm">Follow-ups agendados</CardTitle>
              <p className="text-xs text-muted-foreground">
                mensagens que você programou para sair fora da cadência da IA
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Lead</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead className="hidden md:table-cell">Agendado para</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingManual && <TableSkeleton cols={5} rows={3} />}
                  {!loadingManual && manual.length === 0 && (
                    <EmptyRow
                      cols={5}
                      title="Nenhum follow-up agendado"
                      hint="Use “Agendar follow-up” para programar uma mensagem para um lead específico, no dia e hora que você escolher."
                    />
                  )}
                  {manual.map((f) => {
                    const meta = MANUAL_STATUS_META[f.status];
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="pl-4">
                          <p className="font-medium">{f.leadName ?? f.leadPhone}</p>
                          <p className="text-xs text-muted-foreground">{f.leadPhone}</p>
                        </TableCell>
                        <TableCell className="max-w-56">
                          <p className="truncate text-sm text-muted-foreground" title={f.message}>
                            {f.message}
                          </p>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                          {formatDateTime(f.scheduledAt)}
                        </TableCell>
                        <TableCell>
                          <span
                            className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold"
                            style={pillStyle(meta.color)}
                          >
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {f.status === "pending" && (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Marcar enviado"
                                disabled={statusMutation.isPending}
                                onClick={() => statusMutation.mutate({ id: f.id, status: "sent" })}
                              >
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Cancelar"
                                disabled={statusMutation.isPending}
                                onClick={() => setCancelTarget(f)}
                              >
                                <XCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <FollowupCreateDialog open={createOpen} onOpenChange={setCreateOpen} agents={agents} />

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar follow-up?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem agendada para {cancelTarget?.leadName ?? cancelTarget?.leadPhone} não será
              enviada. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelTarget) {
                  statusMutation.mutate({ id: cancelTarget.id, status: "cancelled" });
                }
                setCancelTarget(null);
              }}
            >
              Cancelar follow-up
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
