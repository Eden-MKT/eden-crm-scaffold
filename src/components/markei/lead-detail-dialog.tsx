import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquareText, Save } from "lucide-react";
import { toast } from "sonner";

import { fetchConversationHasAppointment, updateLeadName } from "@/lib/markei/leads";
import { markeiKeys } from "@/lib/markei/queries";
import { LEAD_STATUS_META, leadStatus, type MarkeiLead } from "@/lib/markei/types";
import { contactLabel } from "@/lib/whatsapp/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LeadJourneyStepper } from "./lead-journey-stepper";

function probColor(p: number): string {
  if (p >= 70) return "#1EA340";
  if (p >= 40) return "#E0A52F";
  return "#F43F5E";
}

interface LeadDetailDialogProps {
  lead: MarkeiLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Detalhe do lead: jornada, contexto, chance de conversão e edição do nome.
// Status é somente leitura — definido pela IA (RLS não permite editar).
export function LeadDetailDialog({ lead, open, onOpenChange }: LeadDetailDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");

  useEffect(() => {
    if (lead) setName(lead.contactName ?? "");
  }, [lead]);

  const { data: hasAppointment } = useQuery({
    queryKey: markeiKeys.leadHasAppointment(lead?.id ?? ""),
    queryFn: () => fetchConversationHasAppointment(lead?.id ?? ""),
    enabled: open && !!lead,
  });

  const nameMutation = useMutation({
    mutationFn: async () => {
      if (!lead) return;
      await updateLeadName(lead.id, name.trim());
    },
    onSuccess: () => {
      toast.success("Nome atualizado.");
      queryClient.invalidateQueries({ queryKey: markeiKeys.all });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar o nome."),
  });

  if (!lead) return null;

  const status = LEAD_STATUS_META[leadStatus(lead)];
  const activeStep = lead.converted
    ? 5
    : hasAppointment
      ? 4
      : lead.leadStatus === "qualificado"
        ? 3
        : lead.analyzedAt || lead.lastMessagePreview
          ? 2
          : 1;
  const prob = lead.conversionProbability;
  const summary = lead.leadInterest ?? lead.contextSummary ?? "Sem resumo ainda";

  const openChat = () => {
    onOpenChange(false);
    navigate({
      to: "/gestao",
      search: { view: "chat", agent: lead.agentId, conversa: lead.id },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">{contactLabel(lead)}</DialogTitle>
          <DialogDescription>
            {lead.remoteJid.split("@")[0]} · {lead.agentName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Jornada */}
          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Jornada
            </p>
            <LeadJourneyStepper activeStep={activeStep} />
          </section>

          {/* Contexto & Resumo */}
          <section className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contexto &amp; Resumo
            </p>
            <p className="text-sm">{summary}</p>
          </section>

          {/* Chance de conversão */}
          <section className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Chance de Conversão
              </p>
              <span
                className="text-sm font-semibold"
                style={prob != null ? { color: probColor(prob) } : undefined}
              >
                {prob != null ? `${prob}%` : "—"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${prob ?? 0}%`,
                  background: prob != null ? probColor(prob) : undefined,
                }}
              />
            </div>
            {lead.analysisSummary && (
              <p className="mt-2 text-xs text-muted-foreground">{lead.analysisSummary}</p>
            )}
          </section>

          {/* Nome (editável) + status (readonly) */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Nome do lead</Label>
              <div className="flex gap-2">
                <Input
                  id="lead-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do contato"
                />
                <Button
                  size="icon"
                  variant="outline"
                  title="Salvar nome"
                  disabled={nameMutation.isPending || !name.trim()}
                  onClick={() => nameMutation.mutate()}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div>
                <span
                  className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{
                    color: status.color,
                    // color-mix: status.color é um token var(--...), então alfa
                    // concatenado em hex não funcionaria.
                    backgroundColor: `color-mix(in oklab, ${status.color} 14%, transparent)`,
                    border: `1px solid color-mix(in oklab, ${status.color} 32%, transparent)`,
                  }}
                >
                  {status.label}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">definido pela IA</p>
            </div>
          </section>

          <Button className="w-full" onClick={openChat}>
            <MessageSquareText className="mr-2 h-4 w-4" /> Intervir na Conversa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
