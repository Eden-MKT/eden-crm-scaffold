import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { updateAgent, whatsappKeys } from "@/lib/whatsapp/queries";
import {
  DEFAULT_AGENDA_HOURS,
  WEEKDAYS,
  type AgendaHours,
  type AgentExtraField,
  type AgentService,
  type WhatsappAgent,
} from "@/lib/whatsapp/types";
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
    responsibleName: agent.responsibleName,
    responsiblePhone: agent.responsiblePhone,
    businessAddress: agent.businessAddress,
    profession: agent.profession,
    registrationNumber: agent.registrationNumber,
    responseDelaySeconds: agent.responseDelaySeconds,
    isMedical: agent.isMedical,
    agendaEnabled: agent.agendaEnabled,
  });
  const [extraFields, setExtraFields] = useState<AgentExtraField[]>(agent.extraFields);
  const [services, setServices] = useState<AgentService[]>(agent.agendaServices);
  const [hours, setHours] = useState<AgendaHours>(agent.agendaHours ?? DEFAULT_AGENDA_HOURS);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setExtra = (i: number, patch: Partial<AgentExtraField>) =>
    setExtraFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const addExtra = () => setExtraFields((fs) => [...fs, { label: "", value: "" }]);
  const removeExtra = (i: number) => setExtraFields((fs) => fs.filter((_, idx) => idx !== i));

  const setService = (i: number, patch: Partial<AgentService>) =>
    setServices((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addService = () => setServices((ss) => [...ss, { label: "", durationMin: 60 }]);
  const removeService = (i: number) => setServices((ss) => ss.filter((_, idx) => idx !== i));

  const setDay = (key: (typeof WEEKDAYS)[number]["key"], patch: Partial<AgendaHours["mon"]>) =>
    setHours((h) => ({ ...h, [key]: { ...h[key], ...patch } }));
  const setLunch = (patch: Partial<AgendaHours["lunch"]>) =>
    setHours((h) => ({ ...h, lunch: { ...h.lunch, ...patch } }));

  const mutation = useMutation({
    mutationFn: () =>
      updateAgent(agent.id, {
        ...form,
        responseDelaySeconds: Math.max(3, Math.round(form.responseDelaySeconds || 15)),
        // Descarta linhas totalmente vazias e apara espaços.
        extraFields: extraFields
          .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
          .filter((f) => f.label || f.value),
        agendaServices: services
          .map((s) => ({
            label: s.label.trim(),
            durationMin: Math.max(5, Number(s.durationMin) || 60),
          }))
          .filter((s) => s.label),
        agendaHours: hours,
      }),
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

        <div className="space-y-4 pb-6">
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

          {/* Dados estruturados do cliente — injetados no atendimento da IA. */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Dados do cliente (usados pela IA)</p>
              <p className="text-xs text-muted-foreground">
                A IA usa esses dados no atendimento — ex.: informar quem entrará em contato. Deixe
                em branco o que não se aplica.
              </p>
            </div>

            <Field label="Responsável pelo atendimento (quem assume o lead)">
              <Input
                value={form.responsibleName}
                onChange={(e) => set("responsibleName", e.target.value)}
                placeholder="Ex.: Dra. Lívia Domingues"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Telefone do responsável">
                <Input
                  value={form.responsiblePhone}
                  onChange={(e) => set("responsiblePhone", e.target.value)}
                  placeholder="(62) 9 9999-9999"
                />
              </Field>
              <Field label="Nº de registro (CRM/OAB/…)">
                <Input
                  value={form.registrationNumber}
                  onChange={(e) => set("registrationNumber", e.target.value)}
                  placeholder="Ex.: CRM-GO 12345"
                />
              </Field>
            </div>

            <Field label="Profissão / Especialidade">
              <Input
                value={form.profession}
                onChange={(e) => set("profession", e.target.value)}
                placeholder="Ex.: Médica dermatologista"
              />
            </Field>

            <Field label="Endereço">
              <Input
                value={form.businessAddress}
                onChange={(e) => set("businessAddress", e.target.value)}
                placeholder="Ex.: Rua X, 123 — Goiânia/GO"
              />
            </Field>

            {/* Campos livres — qualquer outro dado variável do cliente. */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Outros campos (opcional)</Label>
              {extraFields.length === 0 && (
                <p className="text-xs text-muted-foreground/70">
                  Nenhum campo extra. Adicione qualquer outro dado que a IA deva conhecer.
                </p>
              )}
              {extraFields.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-[2]"
                    value={f.label}
                    onChange={(e) => setExtra(i, { label: e.target.value })}
                    placeholder="Rótulo (ex.: Horário)"
                  />
                  <Input
                    className="flex-[3]"
                    value={f.value}
                    onChange={(e) => setExtra(i, { value: e.target.value })}
                    placeholder="Valor (ex.: Seg a Sex, 8h–18h)"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeExtra(i)}
                    title="Remover campo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={addExtra}
              >
                <Plus className="h-4 w-4" /> Adicionar campo
              </Button>
            </div>
          </div>

          {/* Agenda / nicho médico */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Nicho médico</p>
                <p className="text-xs text-muted-foreground">
                  Ajusta o atendimento para pacientes (primeira vez/retorno, queixa, convênio).
                </p>
              </div>
              <Switch checked={form.isMedical} onCheckedChange={(v) => set("isMedical", v)} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Agenda ativa</p>
                <p className="text-xs text-muted-foreground">
                  A IA pode marcar consultas/procedimentos e conferir horários livres.
                </p>
              </div>
              <Switch
                checked={form.agendaEnabled}
                onCheckedChange={(v) => set("agendaEnabled", v)}
              />
            </div>

            {form.agendaEnabled && (
              <div className="space-y-4 border-t border-border pt-3">
                {/* Tipos de atendimento */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Tipos de atendimento (nome + duração em minutos)
                  </Label>
                  {services.length === 0 && (
                    <p className="text-xs text-muted-foreground/70">
                      Ex.: Consulta 60min, Botox 30min, Preenchimento 120min.
                    </p>
                  )}
                  {services.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        className="flex-[3]"
                        value={s.label}
                        onChange={(e) => setService(i, { label: e.target.value })}
                        placeholder="Ex.: Consulta"
                      />
                      <Input
                        type="number"
                        min="5"
                        step="5"
                        className="w-24"
                        value={s.durationMin}
                        onChange={(e) => setService(i, { durationMin: Number(e.target.value) })}
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeService(i)}
                        title="Remover tipo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={addService}
                  >
                    <Plus className="h-4 w-4" /> Adicionar tipo
                  </Button>
                </div>

                {/* Horário de atendimento */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Horário de atendimento</Label>
                  {WEEKDAYS.map(({ key, label }) => {
                    const d = hours[key];
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Switch
                          checked={d.open}
                          onCheckedChange={(v) => setDay(key, { open: v })}
                        />
                        <span className="w-16 text-xs">{label}</span>
                        {d.open ? (
                          <>
                            <Input
                              type="time"
                              className="w-28"
                              value={d.start}
                              onChange={(e) => setDay(key, { start: e.target.value })}
                            />
                            <span className="text-xs text-muted-foreground">às</span>
                            <Input
                              type="time"
                              className="w-28"
                              value={d.end}
                              onChange={(e) => setDay(key, { end: e.target.value })}
                            />
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">fechado</span>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={hours.lunch.enabled}
                      onCheckedChange={(v) => setLunch({ enabled: v })}
                    />
                    <span className="w-16 text-xs">Almoço</span>
                    {hours.lunch.enabled && (
                      <>
                        <Input
                          type="time"
                          className="w-28"
                          value={hours.lunch.start}
                          onChange={(e) => setLunch({ start: e.target.value })}
                        />
                        <span className="text-xs text-muted-foreground">às</span>
                        <Input
                          type="time"
                          className="w-28"
                          value={hours.lunch.end}
                          onChange={(e) => setLunch({ end: e.target.value })}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

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

          <Field label="Tempo de espera antes de responder (segundos)">
            <Input
              type="number"
              min="3"
              step="1"
              value={form.responseDelaySeconds}
              onChange={(e) => set("responseDelaySeconds", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Quanto a IA aguarda de silêncio antes de responder — evita responder no meio da
              digitação. Padrão: 15s.
            </p>
          </Field>

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
