// Visão geral / Monitor do Disparador: cards por conta (consumo 24h vs tier),
// lista de campanhas com progresso da fila e taxa de opt-out em destaque, e o
// BOTÃO DE PÂNICO. Pausa/Retoma campanhas e reativa contas via dispatch-admin.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pause, Play, Power, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  dispatchKeys,
  fetchMonitor,
  MESSAGING_LIMITS,
  type AccountMonitor,
  type CampaignMonitor,
} from "@/lib/dispatch/queries";
import { dispatchAdmin } from "@/lib/dispatch/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AccountStatusBadge, CampaignStatusBadge, QualityBadge } from "./dispatch-ui";

function limitLabel(tier: string | null): string {
  if (!tier) return "—";
  const n = MESSAGING_LIMITS[tier];
  return n === Number.POSITIVE_INFINITY ? "∞" : String(n ?? tier);
}

function AccountCard({ acc, onResumed }: { acc: AccountMonitor; onResumed: () => void }) {
  const resume = useMutation({
    mutationFn: () => dispatchAdmin.resumeAccount(acc.id),
    onSuccess: () => {
      toast.success("Conta reativada.");
      onResumed();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const limitN = acc.provider === "cloud" ? MESSAGING_LIMITS[acc.messaging_limit ?? ""] : undefined;
  const pct =
    limitN && Number.isFinite(limitN) && limitN > 0
      ? Math.min(100, Math.round((acc.consumo24h / limitN) * 100))
      : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {acc.display_number || acc.evolution_instance || "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {acc.provider === "cloud" ? "Cloud API (oficial)" : "Evolution (não-oficial)"}
          </p>
        </div>
        <AccountStatusBadge status={acc.status} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {acc.provider === "cloud" && <QualityBadge tier={acc.quality_tier} />}
        <span className="text-xs text-muted-foreground">
          {acc.provider === "cloud" ? `Limite ${limitLabel(acc.messaging_limit)}/24h` : "Sem tier"}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Consumo 24h</span>
          <span className="font-medium">
            {acc.consumo24h}
            {acc.provider === "cloud" && Number.isFinite(limitN ?? NaN)
              ? ` / ${limitLabel(acc.messaging_limit)}`
              : ""}
          </span>
        </div>
        {acc.provider === "cloud" && Number.isFinite(limitN ?? NaN) && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={"h-full rounded-full " + (pct > 85 ? "bg-destructive" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {acc.status === "pausada" && (
        <div className="mt-3">
          {acc.pausado_motivo && (
            <p className="mb-2 text-xs text-warning">Motivo: {acc.pausado_motivo}</p>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="w-full">
                <RotateCcw /> Reativar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reativar esta conta?</AlertDialogTitle>
                <AlertDialogDescription>
                  {acc.pausado_motivo ? `Pausada por: ${acc.pausado_motivo}. ` : ""}A conta voltará
                  a poder enviar. Confirme que a causa da pausa foi resolvida.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => resume.mutate()}>Reativar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function CampaignRow({ cm, onChanged }: { cm: CampaignMonitor; onChanged: () => void }) {
  const c = cm.campaign;
  const pause = useMutation({
    mutationFn: () => dispatchAdmin.pauseCampaign(c.id),
    onSuccess: () => {
      toast.success("Campanha pausada.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resume = useMutation({
    mutationFn: () => dispatchAdmin.resumeCampaign(c.id),
    onSuccess: () => {
      toast.success("Campanha retomada.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalFila = Object.values(cm.fila).reduce((a, b) => a + b, 0);
  const processados = totalFila - (cm.fila.pendente ?? 0) - (cm.fila.processando ?? 0);
  const pct = totalFila ? Math.round((processados / totalFila) * 100) : 0;
  const optOutHigh = cm.optOutRate > 0.02;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{c.nome}</span>
          <CampaignStatusBadge status={c.status} />
          <span className="text-xs text-muted-foreground">via {cm.contaNome}</span>
        </div>
        <div className="flex gap-2">
          {c.status === "rodando" && (
            <Button size="sm" variant="outline" onClick={() => pause.mutate()}>
              <Pause /> Pausar
            </Button>
          )}
          {c.status === "pausada" && (
            <Button size="sm" variant="outline" onClick={() => resume.mutate()}>
              <Play /> Retomar
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Na fila" value={cm.fila.pendente ?? 0} />
        <Stat label="Enviados" value={cm.enviados} />
        <Stat label="Entregues" value={cm.entregues} />
        <Stat label="Lidos" value={cm.lidos} />
        <Stat label="Falhas" value={cm.falhas} tone={cm.falhas ? "warn" : undefined} />
        <Stat label="Suprimidos" value={cm.fila.suprimido ?? 0} />
        <div
          className={
            "rounded-md p-2 " +
            (optOutHigh ? "bg-destructive/15 ring-1 ring-destructive" : "bg-muted/50")
          }
        >
          <p className={"font-semibold " + (optOutHigh ? "text-destructive" : "")}>
            {(cm.optOutRate * 100).toFixed(1)}%
          </p>
          <p className="text-muted-foreground">Opt-out</p>
        </div>
      </div>
      {optOutHigh && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> Taxa de opt-out acima de 2% — considere pausar e
          revisar o conteúdo.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <p className={"font-semibold " + (tone === "warn" ? "text-warning" : "")}>{value}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

export function MonitorTab() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState(30_000);
  const { data } = useQuery({
    queryKey: dispatchKeys.monitor(),
    queryFn: fetchMonitor,
    refetchInterval: interval,
  });

  // Ajusta o polling: 5s se houver campanha rodando, senão 30s.
  if (
    data &&
    ((data.hasRunning && interval !== 5_000) || (!data.hasRunning && interval !== 30_000))
  ) {
    setIntervalMs(data.hasRunning ? 5_000 : 30_000);
  }

  const refresh = () => qc.invalidateQueries({ queryKey: dispatchKeys.monitor() });

  const panic = useMutation({
    mutationFn: () => dispatchAdmin.panic(),
    onSuccess: (r) => {
      toast.success(
        `Pânico acionado: ${r.campanhas_pausadas} campanha(s) e ${r.contas_pausadas} conta(s) pausadas.`,
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Contas de envio</h3>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Power /> Botão de pânico
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Pausar TODAS as campanhas e contas?</AlertDialogTitle>
              <AlertDialogDescription>
                Todas as campanhas em andamento e todas as contas ativas serão pausadas
                imediatamente. Nada será enviado até você reativar manualmente. Use em caso de
                emergência (spam, denúncias, erro grave).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => panic.mutate()}
              >
                Pausar tudo agora
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {(data?.accounts.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conta de envio cadastrada.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.accounts.map((a) => (
            <AccountCard key={a.id} acc={a} onResumed={refresh} />
          ))}
        </div>
      )}

      <h3 className="text-sm font-semibold text-muted-foreground">Campanhas</h3>
      {(data?.campaigns.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
      ) : (
        <div className="space-y-3">
          {data?.campaigns.map((cm) => (
            <CampaignRow key={cm.campaign.id} cm={cm} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
