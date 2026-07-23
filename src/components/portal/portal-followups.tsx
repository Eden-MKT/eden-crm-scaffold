import { useQuery } from "@tanstack/react-query";
import { Ban } from "lucide-react";

import {
  fetchPortalFollowups,
  portalAgendaKeys,
  type PortalAutoFollowup,
} from "@/lib/portal/agenda";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const NEUTRAL = "var(--muted-foreground)";

const STAGE_META: Record<number, { label: string; color: string }> = {
  0: { label: "Antes do 1º lembrete", color: "var(--chart-2)" },
  1: { label: "1º lembrete enviado", color: "var(--warning)" },
  2: { label: "2º lembrete enviado", color: "var(--destructive)" },
  3: { label: "Cadência esgotada", color: NEUTRAL },
};

const MANUAL_STATUS_META: Record<string, { label: string; color: string }> = {
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

function stageOf(c: PortalAutoFollowup): { label: string; color: string } {
  if (c.followupExhausted) return STAGE_META[3];
  return STAGE_META[Math.min(c.followupStage, 3)] ?? STAGE_META[0];
}

/** Linhas fantasma enquanto a tabela carrega. */
function TableSkeleton({ cols, rows = 3 }: { cols: number; rows?: number }) {
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

// Follow-ups do portal do cliente — fila automática da IA + mensagens
// agendadas manualmente pela equipe. Somente leitura.
export function PortalFollowups() {
  const { data, isLoading, isError } = useQuery({
    queryKey: portalAgendaKeys.followups(),
    queryFn: fetchPortalFollowups,
    refetchInterval: 60_000,
  });

  const auto = data?.auto ?? [];
  const manual = data?.manual ?? [];
  const emCadencia = auto.filter((c) => !c.followupExhausted).length;
  const esgotados = auto.filter((c) => c.followupExhausted).length;

  return (
    <main className="mx-auto h-full max-w-6xl space-y-5 overflow-y-auto p-4 md:p-6">
      <PageHeader
        title="Follow-ups"
        subtitle={
          isLoading
            ? "Verificando a cadência automática…"
            : emCadencia > 0
              ? `${emCadencia} ${emCadencia === 1 ? "lead aguardando" : "leads aguardando"} o retorno automático da IA`
              : "Nenhum lead aguardando retorno no momento"
        }
      />

      {isError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar os follow-ups. Tente novamente.
        </p>
      )}

      {/* ---- Fila automática ---- */}
      <Card className="surface-depth">
        <CardHeader className="space-y-0.5 pb-3">
          <CardTitle className="text-sm">Fila automática da IA</CardTitle>
          <p className="text-xs text-muted-foreground">
            leads que pararam de responder e ainda vão receber lembretes
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Lead</TableHead>
                <TableHead>Estágio</TableHead>
                <TableHead className="hidden md:table-cell">Última mensagem</TableHead>
                <TableHead className="hidden md:table-cell">Último lembrete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableSkeleton cols={4} />}
              {!isLoading && auto.length === 0 && (
                <EmptyRow
                  cols={4}
                  title="Nenhum lead na fila"
                  hint="Quando um lead parar de responder, a IA entra com os lembretes automáticos e ele aparece aqui."
                />
              )}
              {auto.map((c) => {
                const stage = stageOf(c);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4">
                      <p className="font-medium">{c.contactName ?? c.remoteJid.split("@")[0]}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {c.remoteJid.split("@")[0]}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={pillStyle(stage.color)}
                      >
                        {stage.label}
                      </span>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                      {formatDateTime(c.lastMessageAt)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                      {formatDateTime(c.lastFollowupAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Contexto de quem saiu da cadência — a próxima ação é humana. */}
      {!isLoading && (
        <Card className="surface-depth">
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
              {esgotados > 0 ? (
                <>
                  <p className="text-sm font-medium">
                    <span className="tabular-nums">{esgotados}</span>{" "}
                    {esgotados === 1 ? "lead esgotou a cadência" : "leads esgotaram a cadência"}
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
      )}

      {/* ---- Manuais ---- */}
      <Card className="surface-depth">
        <CardHeader className="space-y-0.5 pb-3">
          <CardTitle className="text-sm">Follow-ups agendados</CardTitle>
          <p className="text-xs text-muted-foreground">
            mensagens programadas para sair fora da cadência automática
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Mensagem</TableHead>
                <TableHead className="hidden md:table-cell">Agendado para</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Enviado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableSkeleton cols={4} />}
              {!isLoading && manual.length === 0 && (
                <EmptyRow
                  cols={4}
                  title="Nenhum follow-up agendado"
                  hint="Quando a equipe programar uma mensagem para um lead seu, ela aparece aqui."
                />
              )}
              {manual.map((f) => {
                const meta = MANUAL_STATUS_META[f.status] ?? {
                  label: f.status,
                  color: NEUTRAL,
                };
                return (
                  <TableRow key={f.id}>
                    <TableCell className="max-w-64 pl-4">
                      <p className="truncate text-sm" title={f.message}>
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
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                      {formatDateTime(f.sentAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
