import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Download, PauseCircle, Sparkles, UserCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { downloadCsv } from "@/lib/markei/csv";
import { markeiKeys } from "@/lib/markei/queries";
import { TEMPERATURE_META } from "@/lib/markei/types";
import {
  analyzeConversation,
  setAgentAiEnabled,
  setHumanTakeover,
  whatsappKeys,
} from "@/lib/whatsapp/queries";
import {
  contactLabel,
  type LeadStatus,
  type WhatsappConversation,
  type WhatsappMessage,
} from "@/lib/whatsapp/types";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const LEAD_STATUS_BADGE: Record<
  LeadStatus,
  { label: string; variant: "secondary" | "success" | "destructive" }
> = {
  em_atendimento: { label: "Em atendimento", variant: "secondary" },
  qualificado: { label: "Qualificado", variant: "success" },
  desqualificado: { label: "Desqualificado", variant: "destructive" },
};

function probColor(p: number): string {
  if (p >= 70) return "var(--success)";
  if (p >= 40) return "var(--warning)";
  return "var(--destructive)";
}

// color-mix porque as cores são tokens (var(--...)): concatenar alfa em hex
// produziria CSS inválido e a etiqueta perderia fundo e borda.
function pillStyle(color: string) {
  return {
    color,
    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in oklab, ${color} 32%, transparent)`,
  };
}

const SENDER_LABELS: Record<string, string> = {
  contact: "Lead",
  ai: "IA",
  human: "Secretária",
};

interface MarkeiThreadHeaderProps {
  conversation: WhatsappConversation;
  agentId: string;
  aiEnabled: boolean | undefined;
}

// Extras do header da thread no painel Markei: badges de análise + ações
// permitidas ao papel markei (analisar, assumir/devolver, ligar/desligar IA, CSV).
export function MarkeiThreadHeader({ conversation, agentId, aiEnabled }: MarkeiThreadHeaderProps) {
  const queryClient = useQueryClient();
  const [confirmAiOpen, setConfirmAiOpen] = useState(false);

  const statusBadge =
    LEAD_STATUS_BADGE[conversation.leadStatus] ?? LEAD_STATUS_BADGE.em_atendimento;
  const temp = conversation.leadTemperature ? TEMPERATURE_META[conversation.leadTemperature] : null;
  const TempIcon = temp?.icon;
  const prob = conversation.conversionProbability;

  const invalidateConversations = () =>
    queryClient.invalidateQueries({ queryKey: whatsappKeys.conversations(agentId) });

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeConversation(conversation.id),
    onSuccess: () => {
      toast.success("Análise concluída.");
      invalidateConversations();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao analisar."),
  });

  const takeoverMutation = useMutation({
    mutationFn: () => setHumanTakeover(conversation.id, !conversation.humanTakeover),
    onSuccess: () => {
      toast.success(
        conversation.humanTakeover ? "Conversa devolvida à IA." : "Você assumiu a conversa.",
      );
      invalidateConversations();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar."),
  });

  const aiMutation = useMutation({
    mutationFn: () => setAgentAiEnabled(agentId, !aiEnabled),
    onSuccess: () => {
      toast.success(aiEnabled ? "IA desativada." : "IA ativada.");
      queryClient.invalidateQueries({ queryKey: markeiKeys.all });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar a IA."),
  });

  const exportCsv = () => {
    const messages = queryClient.getQueryData<WhatsappMessage[]>(
      whatsappKeys.messages(conversation.id),
    );
    if (!messages?.length) {
      toast.error("Abra a conversa e aguarde as mensagens carregarem.");
      return;
    }
    downloadCsv(
      `conversa-${contactLabel(conversation).replace(/\s+/g, "-").toLowerCase()}.csv`,
      ["Data", "Remetente", "Mensagem"],
      messages.map((msg) => [
        new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
          new Date(msg.sentAt),
        ),
        SENDER_LABELS[msg.sender] ?? msg.sender,
        msg.content ?? `[${msg.messageType}]`,
      ]),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* Badges de análise */}
      <Badge variant={statusBadge.variant} className="rounded-full px-2 py-0.5 text-[10px]">
        {statusBadge.label}
      </Badge>
      {temp && TempIcon && (
        <span
          className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={pillStyle(temp.color)}
        >
          <TempIcon className="h-2.5 w-2.5" /> {temp.label}
        </span>
      )}
      {prob != null && (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={pillStyle(probColor(prob))}
        >
          {prob}%
        </span>
      )}
      {conversation.aiPaused && (
        <span
          className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={pillStyle("#E0A52F")}
        >
          <PauseCircle className="h-2.5 w-2.5" /> Bot Pausado
        </span>
      )}

      {/* Ações */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          title="Analisar IA"
          disabled={analyzeMutation.isPending}
          onClick={() => analyzeMutation.mutate()}
        >
          <Sparkles className="h-4 w-4 text-primary" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={conversation.humanTakeover ? "Devolver a IA" : "Assumir conversa"}
          disabled={takeoverMutation.isPending}
          onClick={() => takeoverMutation.mutate()}
        >
          {conversation.humanTakeover ? (
            <Undo2 className="h-4 w-4 text-success" />
          ) : (
            <UserCheck className="h-4 w-4 text-warning" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={aiEnabled ? "Desativar IA" : "Ativar IA"}
          onClick={() => setConfirmAiOpen(true)}
        >
          <Bot className={aiEnabled ? "h-4 w-4 text-success" : "h-4 w-4 text-destructive"} />
        </Button>
        <Button variant="ghost" size="icon" title="Baixar CSV da conversa" onClick={exportCsv}>
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={confirmAiOpen} onOpenChange={setConfirmAiOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{aiEnabled ? "Desativar a IA?" : "Ativar a IA?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {aiEnabled
                ? "A IA deixará de responder TODAS as conversas deste assistente até ser reativada."
                : "A IA voltará a responder automaticamente as conversas deste assistente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => aiMutation.mutate()}>
              {aiEnabled ? "Desativar IA" : "Ativar IA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
