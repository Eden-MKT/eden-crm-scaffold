// Wizard de nova campanha (Dialog, 4 passos):
//  1. Básico   — nome, conta, template/corpo livre, janela, cap, cooldown
//  2. Segmento — filtros nicho/origem (+ opt-in forçado), contagem
//  3. Revisão  — cria rascunho + fila, roda dry_run e mostra o resultado
//  4. Confirm. — digita o nome p/ liberar o disparo (launch_campaign)
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  countSegment,
  createCampaign,
  deleteCampaign,
  dispatchKeys,
  fetchAccounts,
  fetchSegments,
  fetchTemplates,
  type SegmentFilter,
} from "@/lib/dispatch/queries";
import { dispatchAdmin, type DryRunResult } from "@/lib/dispatch/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Draft {
  nome: string;
  waAccountId: string;
  templateId: string;
  corpoLivre: string;
  janelaInicio: number;
  janelaFim: number;
  capDiario: number;
  cooldownDias: number;
  nichos: string[];
  origens: string[];
}

const EMPTY: Draft = {
  nome: "",
  waAccountId: "",
  templateId: "",
  corpoLivre: "",
  janelaInicio: 9,
  janelaFim: 20,
  capDiario: 200,
  cooldownDias: 30,
  nichos: [],
  origens: [],
};

export function CampaignWizard({
  open,
  onOpenChange,
  onLaunched,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLaunched: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [dry, setDry] = useState<DryRunResult | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const { data: accounts } = useQuery({
    queryKey: dispatchKeys.accounts(),
    queryFn: fetchAccounts,
  });
  const { data: templates } = useQuery({
    queryKey: dispatchKeys.templates(),
    queryFn: fetchTemplates,
  });
  const { data: segments } = useQuery({
    queryKey: dispatchKeys.segments(),
    queryFn: fetchSegments,
  });

  const activeAccounts = (accounts ?? []).filter((a) => a.status === "ativa");
  const conta = activeAccounts.find((a) => a.id === draft.waAccountId);
  const isCloud = conta?.provider === "cloud";
  const accountTemplates = (templates ?? []).filter(
    (t) => t.wa_account_id === draft.waAccountId && t.status_meta === "APPROVED",
  );
  const selectedTpl = accountTemplates.find((t) => t.id === draft.templateId);
  const marketingSemOptout =
    selectedTpl?.categoria === "MARKETING" && !selectedTpl?.tem_botao_optout;

  const filter: SegmentFilter = { nichos: draft.nichos, origens: draft.origens };
  const { data: segCount, isFetching: countFetching } = useQuery({
    queryKey: [...dispatchKeys.all, "segCount", draft.nichos, draft.origens],
    queryFn: () => countSegment(filter),
    enabled: open && step === 2,
  });

  const resetAll = () => {
    setStep(1);
    setDraft(EMPTY);
    setCampaignId(null);
    setDry(null);
    setConfirmName("");
  };

  const close = (o: boolean) => {
    if (!o) resetAll();
    onOpenChange(o);
  };

  // Passo 1 válido?
  const step1Ok =
    draft.nome.trim() &&
    draft.waAccountId &&
    draft.janelaInicio < draft.janelaFim &&
    draft.capDiario > 0 &&
    (isCloud ? draft.templateId && !marketingSemOptout : draft.corpoLivre.trim().length > 0);

  // Cria rascunho + fila e roda o dry_run (passo 2 → 3).
  const buildAndDry = useMutation({
    mutationFn: async () => {
      const id = await createCampaign({
        nome: draft.nome.trim(),
        waAccountId: draft.waAccountId,
        templateId: isCloud ? draft.templateId : null,
        corpoLivre: isCloud ? null : draft.corpoLivre.trim(),
        janelaInicio: draft.janelaInicio,
        janelaFim: draft.janelaFim,
        capDiario: draft.capDiario,
        cooldownDias: draft.cooldownDias,
        filter,
      });
      const result = await dispatchAdmin.dryRun(id);
      return { id, result };
    },
    onSuccess: ({ id, result }) => {
      setCampaignId(id);
      setDry(result);
      setStep(3);
      qc.invalidateQueries({ queryKey: dispatchKeys.campaigns() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const launch = useMutation({
    mutationFn: () => dispatchAdmin.launchCampaign(campaignId!, confirmName),
    onSuccess: () => {
      toast.success("Campanha disparada!");
      qc.invalidateQueries({ queryKey: dispatchKeys.campaigns() });
      qc.invalidateQueries({ queryKey: dispatchKeys.monitor() });
      resetAll();
      onOpenChange(false);
      onLaunched();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Se o usuário abandonar após criar o rascunho, apaga-o (cascade limpa a fila).
  const discardDraft = async () => {
    if (campaignId) {
      try {
        await deleteCampaign(campaignId);
        qc.invalidateQueries({ queryKey: dispatchKeys.campaigns() });
      } catch {
        /* rascunho pode já ter virado 'rodando'; ignora */
      }
    }
    close(false);
  };

  const toggle = (key: "nichos" | "origens", value: string) =>
    setDraft((d) => {
      const set = new Set(d[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...d, [key]: [...set] };
    });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova campanha — passo {step} de 4</DialogTitle>
          <DialogDescription>
            {step === 1 && "Configuração básica e conteúdo."}
            {step === 2 && "Selecione o público-alvo."}
            {step === 3 && "Revisão do dry-run (simulação sem envio)."}
            {step === 4 && "Confirmação final para disparar."}
          </DialogDescription>
        </DialogHeader>

        {/* ----------------------------------------------------------- Passo 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-1 block text-xs">Nome da campanha *</Label>
              <Input
                value={draft.nome}
                onChange={(e) => setDraft((d) => ({ ...d, nome: e.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Conta de envio *</Label>
              <Select
                value={draft.waAccountId}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, waAccountId: v, templateId: "", corpoLivre: "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta ativa" />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {(a.display_number || a.evolution_instance || a.provider) +
                        ` · ${a.provider === "cloud" ? "Cloud" : "Evolution"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeAccounts.length === 0 && (
                <p className="mt-1 text-xs text-warning">Nenhuma conta ativa disponível.</p>
              )}
            </div>

            {draft.waAccountId && isCloud && (
              <div>
                <Label className="mb-1 block text-xs">Template aprovado *</Label>
                <Select
                  value={draft.templateId}
                  onValueChange={(v) => setDraft((d) => ({ ...d, templateId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template APROVADO" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome} ({t.categoria})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {accountTemplates.length === 0 && (
                  <p className="mt-1 text-xs text-warning">
                    Nenhum template APROVADO nesta conta. Sincronize na aba Templates.
                  </p>
                )}
                {marketingSemOptout && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> Template MARKETING sem opt-out não
                    pode ser usado.
                  </p>
                )}
                {selectedTpl && (
                  <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">
                    {selectedTpl.corpo}
                  </pre>
                )}
              </div>
            )}

            {draft.waAccountId && !isCloud && (
              <div>
                <Label className="mb-1 block text-xs">Mensagem (corpo livre) *</Label>
                <Textarea
                  rows={4}
                  placeholder="Olá {{nome}}, tudo bem? ..."
                  value={draft.corpoLivre}
                  onChange={(e) => setDraft((d) => ({ ...d, corpoLivre: e.target.value }))}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Variáveis: <code>{"{{nome}}"}</code> e <code>{"{{empresa}}"}</code>.
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" /> Envio por número não-oficial (Evolution)
                  tem risco de bloqueio. Use com moderação e sempre com opt-in.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label className="mb-1 block text-xs">Janela início (h)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={draft.janelaInicio}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, janelaInicio: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Janela fim (h)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={draft.janelaFim}
                  onChange={(e) => setDraft((d) => ({ ...d, janelaFim: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Cap diário</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.capDiario}
                  onChange={(e) => setDraft((d) => ({ ...d, capDiario: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Cooldown (dias)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.cooldownDias}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, cooldownDias: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- Passo 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O segmento sempre inclui <b>apenas contatos com opt-in</b>. Refine por nicho e origem
              (vazio = todos).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FilterGroup
                title="Nicho"
                values={segments?.nichos ?? []}
                selected={draft.nichos}
                onToggle={(v) => toggle("nichos", v)}
              />
              <FilterGroup
                title="Origem"
                values={segments?.origens ?? []}
                selected={draft.origens}
                onToggle={(v) => toggle("origens", v)}
              />
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              Contatos elegíveis no segmento: <b>{countFetching ? "…" : (segCount ?? 0)}</b>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- Passo 3 */}
        {step === 3 && dry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Metric label="Total na fila" value={dry.total} />
              <Metric label="Elegíveis" value={dry.elegiveis} tone="ok" />
              <Metric label="Previsão (dias)" value={dry.previsao_dias} />
              <Metric label="Em supressão" value={dry.suprimidos.suppression} tone="warn" />
              <Metric label="Sem opt-in" value={dry.suprimidos.sem_opt_in} tone="warn" />
              <Metric label="Em cooldown" value={dry.suprimidos.cooldown} tone="warn" />
              <Metric label="Fora da janela agora" value={dry.fora_janela_agora} />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Amostra de mensagens</p>
              <div className="space-y-2">
                {dry.amostra.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum contato elegível.</p>
                )}
                {dry.amostra.map((a, i) => (
                  <div key={i} className="flex flex-col">
                    <span className="mb-0.5 text-xs text-muted-foreground">
                      {a.nome || a.telefone}
                    </span>
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-primary/10 px-3 py-2 text-sm">
                      {a.mensagem}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- Passo 4 */}
        {step === 4 && dry && (
          <div className="space-y-4">
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              Você está prestes a disparar <b>{dry.elegiveis}</b> mensagem(ns) pela campanha{" "}
              <b>{draft.nome}</b>. Digite o nome exato da campanha para confirmar.
            </div>
            <div>
              <Label className="mb-1 block text-xs">Nome da campanha</Label>
              <Input
                value={confirmName}
                placeholder={draft.nome}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button disabled={!step1Ok} onClick={() => setStep(2)}>
                Próximo
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button
                disabled={(segCount ?? 0) === 0 || buildAndDry.isPending}
                onClick={() => buildAndDry.mutate()}
              >
                {buildAndDry.isPending ? (
                  <>
                    <Loader2 className="animate-spin" /> Preparando...
                  </>
                ) : (
                  "Gerar dry-run"
                )}
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={discardDraft}>
                Descartar rascunho
              </Button>
              <Button onClick={() => setStep(4)}>Ir para confirmação</Button>
            </>
          )}
          {step === 4 && (
            <>
              <Button variant="outline" onClick={() => setStep(3)}>
                Voltar
              </Button>
              <Button
                disabled={confirmName !== draft.nome || launch.isPending}
                onClick={() => launch.mutate()}
              >
                {launch.isPending ? (
                  <>
                    <Loader2 className="animate-spin" /> Disparando...
                  </>
                ) : (
                  "Disparar campanha"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterGroup({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{title}</p>
      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem valores.</p>
      ) : (
        <div className="max-h-40 space-y-1.5 overflow-y-auto">
          {values.map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <Checkbox checked={selected.includes(v)} onCheckedChange={() => onToggle(v)} />
              {v}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p
        className={
          "text-lg font-semibold " +
          (tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : "")
        }
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
