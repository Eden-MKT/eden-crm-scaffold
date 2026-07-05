import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { updateAgent, whatsappKeys } from "@/lib/whatsapp/queries";
import type { WhatsappAgent } from "@/lib/whatsapp/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MODELS = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini (rápido e econômico)" },
  { id: "gpt-4o", label: "gpt-4o (mais inteligente, mais caro)" },
];

interface AgentSettingsSheetProps {
  agent: WhatsappAgent;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentSettingsSheet({
  agent,
  clientName,
  open,
  onOpenChange,
}: AgentSettingsSheetProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    systemPrompt: agent.systemPrompt,
    niche: agent.niche,
    businessInfo: agent.businessInfo,
    conversionGoal: agent.conversionGoal,
    greeting: agent.greeting,
    model: agent.model,
    temperature: agent.temperature,
    aiEnabled: agent.aiEnabled,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => updateAgent(agent.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.agents() });
      toast.success("Configurações salvas.");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Configurações do agente</SheetTitle>
          <SheetDescription>{clientName}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">IA ativa</p>
              <p className="text-xs text-muted-foreground">
                Se desligada, a IA não responde automaticamente.
              </p>
            </div>
            <Switch checked={form.aiEnabled} onCheckedChange={(v) => set("aiEnabled", v)} />
          </div>

          <Field label="Nicho do cliente">
            <Input
              value={form.niche}
              onChange={(e) => set("niche", e.target.value)}
              placeholder="Ex.: perícia médica, estética, advocacia…"
            />
          </Field>

          <Field label="Prompt do agente (personalidade e instruções)">
            <Textarea
              rows={6}
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              placeholder="Você é o atendente da clínica X. Seu papel é qualificar leads e agendar avaliações…"
            />
          </Field>

          <Field label="Informações do negócio (dados, ofertas, horários, FAQ)">
            <Textarea
              rows={5}
              value={form.businessInfo}
              onChange={(e) => set("businessInfo", e.target.value)}
              placeholder="Endereço, serviços, preços, formas de pagamento, diferenciais, perguntas frequentes…"
            />
          </Field>

          <Field label="Objetivo de conversão">
            <Input
              value={form.conversionGoal}
              onChange={(e) => set("conversionGoal", e.target.value)}
              placeholder="Ex.: agendar uma avaliação; fechar orçamento; marcar consulta"
            />
          </Field>

          <Field label="Saudação inicial (opcional)">
            <Input
              value={form.greeting}
              onChange={(e) => set("greeting", e.target.value)}
              placeholder="Oi! Aqui é da clínica X 😊 Como posso te ajudar?"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Modelo">
              <Select value={form.model} onValueChange={(v) => set("model", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Criatividade (${form.temperature.toFixed(1)})`}>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={form.temperature}
                onChange={(e) => set("temperature", Number(e.target.value))}
              />
            </Field>
          </div>

          <Button
            className="w-full"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
