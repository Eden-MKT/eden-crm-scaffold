import { useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  Eye,
  Flame,
  FilterX,
  Search,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { downloadCsv } from "@/lib/markei/csv";
import {
  fetchLeadsForCsv,
  fetchMarkeiLeads,
  LEADS_PAGE_SIZE,
  type LeadFilters,
  type LeadSort,
} from "@/lib/markei/leads";
import { fetchMarkeiMetrics, markeiKeys } from "@/lib/markei/queries";
import {
  LEAD_STATUS_META,
  leadStatus,
  TEMPERATURE_META,
  type LeadDerivedStatus,
  type MarkeiLead,
  type Period,
} from "@/lib/markei/types";
import { contactLabel, type WhatsappConversation } from "@/lib/whatsapp/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricCard, type MetricTone } from "./metric-card";
import { PeriodSelect } from "./period-select";
import { LeadDetailDialog } from "./lead-detail-dialog";

const STATUS_OPTIONS: { value: LeadDerivedStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "novo", label: "Novos" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "respondeu", label: "Responderam" },
  { value: "convertido", label: "Convertidos" },
];

const SORT_OPTIONS: { value: LeadSort; label: string }[] = [
  { value: "recent", label: "Mais recentes" },
  { value: "oldest", label: "Mais antigos" },
  { value: "name", label: "Nome" },
];

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

/** "há 2 h" — leitura rápida de quão fria está a conversa. */
function relativeTime(iso: string | null): string {
  if (!iso) return "Sem mensagens";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  const months = Math.round(days / 30);
  return `há ${months} ${months === 1 ? "mês" : "meses"}`;
}

/**
 * Etiqueta tonal. As cores dos metadados são tokens (`var(--…)`), então a
 * transparência precisa vir de color-mix — concatenar "1f" no fim geraria
 * CSS inválido e a etiqueta ficaria sem fundo.
 */
function Pill({ color, icon, children }: { color: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 32%, transparent)`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

/** Cápsula com o ícone da temperatura — é o que dá a varredura na lista. */
function TemperatureMark({ lead }: { lead: WhatsappConversation }) {
  const meta = TEMPERATURE_META[lead.leadTemperature ?? "unanalyzed"];
  const Icon = meta.icon;
  return (
    <span
      title={`Temperatura: ${meta.label}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
      style={{
        background: `color-mix(in oklab, ${meta.color} 18%, transparent)`,
        color: meta.color,
      }}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function StatusBadges({ lead }: { lead: WhatsappConversation }) {
  const status = LEAD_STATUS_META[leadStatus(lead)];
  const temp = lead.leadTemperature ? TEMPERATURE_META[lead.leadTemperature] : null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Pill color={status.color}>{status.label}</Pill>
      {temp && <Pill color={temp.color}>{temp.label}</Pill>}
      {lead.humanTakeover && (
        <Pill color="var(--warning)" icon={<UserCheck className="h-2.5 w-2.5" />}>
          Humano assumiu
        </Pill>
      )}
    </div>
  );
}

// "Pacientes e Leads" — tabela paginada com filtros, exportação CSV e modal
// de detalhe. Leitura para o papel markei (nome editável via modal).
export function MarkeiLeads() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [status, setStatus] = useState<LeadDerivedStatus | "all">("all");
  const [agentId, setAgentId] = useState<string>("all");
  const [sort, setSort] = useState<LeadSort>("recent");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<MarkeiLead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Debounce de 300ms na busca.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Volta para a página 1 quando qualquer filtro muda.
  useEffect(() => {
    setPage(1);
  }, [debounced, period, status, agentId, sort]);

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: markeiKeys.metrics(),
    queryFn: () => fetchMarkeiMetrics(),
  });
  const agents = metrics?.porAgente ?? [];
  const agentName = useMemo(() => new Map(agents.map((a) => [a.agentId, a.nome])), [agents]);

  const filters: LeadFilters = {
    search: debounced,
    agentId: agentId === "all" ? undefined : agentId,
    status,
    period,
    sort,
    page,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: markeiKeys.leads(filters),
    queryFn: () => fetchMarkeiLeads(filters),
    placeholderData: keepPreviousData,
  });

  const rows: MarkeiLead[] = (data?.rows ?? []).map((c) => ({
    ...c,
    agentName: agentName.get(c.agentId) ?? "—",
  }));
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));

  // Só para o texto de apoio — não altera nenhuma consulta.
  const hasActiveFilters =
    debounced.trim() !== "" || period !== "all" || status !== "all" || agentId !== "all";

  // Faixa do primeiro/último item mostrado nesta página.
  const rangeStart = total === 0 ? 0 : (page - 1) * LEADS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * LEADS_PAGE_SIZE, total);

  // Resumo da base inteira (RPC markei_metrics) — independente dos filtros da lista.
  const temp = metrics?.temperatureDistribution;
  const baseTotal = temp ? temp.hot + temp.warm + temp.cold + temp.unanalyzed : 0;
  const share = (n: number) => (baseTotal > 0 ? (n / baseTotal) * 100 : 0);

  const summary: {
    label: string;
    value: number | string;
    hint: string;
    tone: MetricTone;
    icon: ReactNode;
    share?: number;
    emphasis?: boolean;
  }[] = [
    {
      label: "Leads na base",
      value: baseTotal,
      hint: "todas as conversas já registradas",
      tone: "info",
      icon: <Users className="h-4 w-4" />,
      emphasis: true,
    },
    {
      label: "Quentes",
      value: temp?.hot ?? 0,
      hint: "alta chance de fechar — priorize o contato",
      tone: "danger",
      icon: <Flame className="h-4 w-4" />,
      share: share(temp?.hot ?? 0),
      emphasis: true,
    },
    {
      label: "Mornos",
      value: temp?.warm ?? 0,
      hint: "ainda em conversa, vale um empurrão",
      tone: "warning",
      icon: <TrendingUp className="h-4 w-4" />,
      share: share(temp?.warm ?? 0),
    },
    {
      label: "Convertidos",
      value: metrics?.conversoes ?? 0,
      hint: `${(metrics?.taxaConversao ?? 0).toFixed(0)}% de conversão na base`,
      tone: "success",
      icon: <CheckCircle2 className="h-4 w-4" />,
      share: metrics?.taxaConversao ?? 0,
    },
  ];

  const clearFilters = () => {
    setSearch("");
    setDebounced("");
    setPeriod("all");
    setStatus("all");
    setAgentId("all");
    setSort("recent");
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const leads = await fetchLeadsForCsv(filters);
      downloadCsv(
        `leads-markei-${new Date().toISOString().slice(0, 10)}.csv`,
        ["Nome", "Telefone", "IA", "Status", "Temperatura", "Prob. Conversão", "Última mensagem"],
        leads.map((c) => [
          contactLabel(c),
          c.remoteJid.split("@")[0],
          agentName.get(c.agentId) ?? "—",
          LEAD_STATUS_META[leadStatus(c)].label,
          c.leadTemperature ? TEMPERATURE_META[c.leadTemperature].label : "Não analisado",
          c.conversionProbability != null ? `${c.conversionProbability}%` : "—",
          formatDateTime(c.lastMessageAt),
        ]),
      );
      toast.success(`CSV gerado com ${leads.length} leads.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o CSV.");
    } finally {
      setExporting(false);
    }
  };

  const openDetail = (lead: MarkeiLead) => {
    setDetail(lead);
    setDetailOpen(true);
  };

  const emptyState = (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Search className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium">Nenhum lead por aqui</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {hasActiveFilters
          ? "Nenhum lead combina com os filtros atuais. Tente ampliar o período ou limpar os filtros."
          : "Assim que a IA receber a primeira mensagem, o lead aparece nesta lista."}
      </p>
      {hasActiveFilters && (
        <Button variant="outline" size="sm" className="mt-1" onClick={clearFilters}>
          <FilterX className="mr-1.5 h-4 w-4" /> Limpar filtros
        </Button>
      )}
    </div>
  );

  return (
    <main className="mx-auto h-full max-w-6xl space-y-6 overflow-y-auto p-4 md:p-6">
      <PageHeader
        title="Pacientes e leads"
        subtitle={
          isLoading
            ? "Buscando leads…"
            : hasActiveFilters
              ? `${total} ${total === 1 ? "lead encontrado" : "leads encontrados"} com os filtros atuais`
              : `${total} ${total === 1 ? "lead" : "leads"} no total · os mais recentes primeiro`
        }
        action={
          <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Gerando…" : "Baixar CSV"}
          </Button>
        }
      />

      {/* Resumo da base inteira — dá o contexto antes de mergulhar na lista. */}
      {metricsLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.map((c) => (
            <StaggerItem key={c.label}>
              <MetricCard {...c} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {/* Filtros — agrupados numa faixa própria para não competir com a lista. */}
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 md:max-w-xs">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone…"
              className="bg-background pl-8"
            />
          </div>
          <PeriodSelect value={period} onChange={setPeriod} />
          <Select value={status} onValueChange={(v) => setStatus(v as LeadDerivedStatus | "all")}>
            <SelectTrigger className="w-40 bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-44 bg-background">
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
          <Select value={sort} onValueChange={(v) => setSort(v as LeadSort)}>
            <SelectTrigger className="w-40 bg-background">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <FilterX className="mr-1.5 h-4 w-4" /> Limpar
          </Button>
        </div>
      </div>

      {isError && (
        <Card className="surface-depth">
          <CardContent className="space-y-1 py-8 text-center">
            <p className="text-sm font-medium text-destructive">
              Não foi possível carregar os leads.
            </p>
            <p className="text-xs text-muted-foreground">
              Verifique a conexão e tente ajustar os filtros novamente.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading && !isError && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Tabela — desktop */}
          <Card className="surface-depth hidden overflow-hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Lead</TableHead>
                    <TableHead>Médico (IA)</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Última mensagem</TableHead>
                    <TableHead className="w-16 pr-4 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="p-0">
                        {emptyState}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((lead) => (
                    <TableRow key={lead.id} className="group">
                      <TableCell className="py-3 pl-4">
                        <div className="flex items-center gap-3">
                          <TemperatureMark lead={lead} />
                          <div className="min-w-0">
                            <p className="truncate font-medium leading-tight">
                              {contactLabel(lead)}
                            </p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {lead.remoteJid.split("@")[0]}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.agentName}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <StatusBadges lead={lead} />
                          {lead.conversionProbability != null && (
                            <p className="text-[11px] text-muted-foreground">
                              {lead.conversionProbability}% de chance de fechar
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p className="text-sm">{relativeTime(lead.lastMessageAt)}</p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {formatDateTime(lead.lastMessageAt)}
                        </p>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver detalhes"
                          onClick={() => openDetail(lead)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Cards — mobile */}
          <div className="space-y-2 md:hidden">
            {rows.length === 0 && (
              <Card className="surface-depth">
                <CardContent className="p-0">{emptyState}</CardContent>
              </Card>
            )}
            {rows.map((lead) => (
              <Card key={lead.id} className="surface-depth surface-depth-hover">
                <CardContent className="flex items-start gap-3 p-3">
                  <TemperatureMark lead={lead} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight">
                        {contactLabel(lead)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {lead.remoteJid.split("@")[0]} · {lead.agentName}
                      </p>
                    </div>
                    <StatusBadges lead={lead} />
                    <p className="text-[11px] text-muted-foreground">
                      {relativeTime(lead.lastMessageAt)}
                      {lead.conversionProbability != null &&
                        ` · ${lead.conversionProbability}% de chance de fechar`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Ver detalhes"
                    onClick={() => openDetail(lead)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Paginação */}
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <span className="text-xs tabular-nums text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {total}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <LeadDetailDialog lead={detail} open={detailOpen} onOpenChange={setDetailOpen} />
    </main>
  );
}
