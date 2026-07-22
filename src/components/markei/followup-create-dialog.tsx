import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";

import { markeiKeys } from "@/lib/markei/queries";
import type { MarkeiAgentSummary } from "@/lib/markei/types";
import { createManualFollowUp, fetchConversations, whatsappKeys } from "@/lib/whatsapp/queries";
import { contactLabel } from "@/lib/whatsapp/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface FollowupCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: MarkeiAgentSummary[];
}

// Agendamento de follow-up manual: IA → lead → data/hora → mensagem.
export function FollowupCreateDialog({ open, onOpenChange, agents }: FollowupCreateDialogProps) {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState("");

  const { data: conversations, isLoading: loadingConversations } = useQuery({
    queryKey: whatsappKeys.conversations(agentId),
    queryFn: () => fetchConversations(agentId),
    enabled: !!agentId,
  });

  const reset = () => {
    setAgentId("");
    setConversationId("");
    setScheduledAt("");
    setMessage("");
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createManualFollowUp({
        conversationId,
        agentId,
        message: message.trim(),
        scheduledAt: new Date(scheduledAt).toISOString(),
      }),
    onSuccess: () => {
      toast.success("Follow-up agendado.");
      queryClient.invalidateQueries({ queryKey: markeiKeys.manualFollowups() });
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao agendar o follow-up."),
  });

  const canSubmit = !!agentId && !!conversationId && !!scheduledAt && !!message.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Novo Follow-up
          </DialogTitle>
          <DialogDescription>
            A mensagem será enviada automaticamente no horário agendado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>IA</Label>
            <Select
              value={agentId}
              onValueChange={(v) => {
                setAgentId(v);
                setConversationId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a IA" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.agentId} value={a.agentId}>
                    {a.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Lead</Label>
            <Select
              value={conversationId}
              onValueChange={setConversationId}
              disabled={!agentId || loadingConversations}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !agentId
                      ? "Selecione a IA primeiro"
                      : loadingConversations
                        ? "Carregando leads…"
                        : "Selecione o lead"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(conversations ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {contactLabel(c)} · {c.remoteJid.split("@")[0]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fup-when">Agendado para</Label>
            <Input
              id="fup-when"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fup-msg">Mensagem</Label>
            <Textarea
              id="fup-msg"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Olá! Passando para saber se ficou alguma dúvida…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Agendando…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
