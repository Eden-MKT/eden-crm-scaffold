import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { fetchPortalConversations, portalChatKeys } from "@/lib/portal/chat";
import {
  LEAD_STATUS_META,
  leadStatus,
  TEMPERATURE_META,
  type TemperatureKey,
} from "@/lib/markei/types";
import { contactLabel, type WhatsappConversation } from "@/lib/whatsapp/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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

const TEMP_OPTIONS: { value: TemperatureKey | "all"; label: string }[] = [
  { value: "all", label: "Todas as temperaturas" },
  { value: "hot", label: "Quentes" },
  { value: "warm", label: "Mornos" },
  { value: "cold", label: "Frios" },
  { value: "unanalyzed", label: "Não analisados" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Etiqueta tonal — cores em token exigem color-mix para o fundo/borda. */
function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 32%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

/** Cápsula com o ícone da temperatura — varredura visual da lista. */
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
    </div>
  );
}

// Leads do portal do cliente — lista das conversas da própria IA, com
// temperatura, status e probabilidade de conversão. Somente leitura.
export function PortalLeads() {
  const [search, setSearch] = useState("");
  const [temp, setTemp] = useState<TemperatureKey | "all">("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: portalChatKeys.conversations(),
    queryFn: fetchPortalConversations,
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (temp !== "all" && (c.leadTemperature ?? "unanalyzed") !== temp) return false;
      if (!q) return true;
      return contactLabel(c).toLowerCase().includes(q) || c.remoteJid.split("@")[0].includes(q);
    });
  }, [data, search, temp]);

  const total = data?.length ?? 0;

  return (
    <main className="mx-auto h-full max-w-6xl space-y-5 overflow-y-auto p-4 md:p-6">
      <PageHeader
        title="Leads"
        subtitle={
          isLoading
            ? "Buscando leads…"
            : `${total} ${total === 1 ? "lead" : "leads"} atendidos pela sua IA`
        }
      />

      {/* Filtros */}
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
          <Select value={temp} onValueChange={(v) => setTemp(v as TemperatureKey | "all")}>
            <SelectTrigger className="w-52 bg-background">
              <SelectValue placeholder="Temperatura" />
            </SelectTrigger>
            <SelectContent>
              {TEMP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar os leads. Tente novamente.
        </p>
      )}

      {isLoading && !isError && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
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
                    <TableHead>Situação</TableHead>
                    <TableHead>Prob. de fechar</TableHead>
                    <TableHead>Última mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="py-10 text-center">
                        <p className="text-sm font-medium">Nenhum lead por aqui</p>
                        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                          {total === 0
                            ? "Assim que a IA receber a primeira mensagem, o lead aparece nesta lista."
                            : "Nenhum lead combina com os filtros atuais."}
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((lead) => (
                    <TableRow key={lead.id}>
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
                      <TableCell>
                        <StatusBadges lead={lead} />
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {lead.conversionProbability != null
                          ? `${lead.conversionProbability}%`
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(lead.lastMessageAt)}
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
              <p className="py-8 text-center text-sm text-muted-foreground">
                {total === 0
                  ? "Assim que a IA receber a primeira mensagem, o lead aparece aqui."
                  : "Nenhum lead combina com os filtros atuais."}
              </p>
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
                        {lead.remoteJid.split("@")[0]}
                      </p>
                    </div>
                    <StatusBadges lead={lead} />
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(lead.lastMessageAt)}
                      {lead.conversionProbability != null &&
                        ` · ${lead.conversionProbability}% de chance de fechar`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
