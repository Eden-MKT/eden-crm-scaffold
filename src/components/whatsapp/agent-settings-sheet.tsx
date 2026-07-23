import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, Trash2, Video } from "lucide-react";
import { toast } from "sonner";

import { updateAgent, whatsappKeys } from "@/lib/whatsapp/queries";
import { improvePrompt } from "@/lib/whatsapp/improve-prompt";
import { slugifyObjectionTipo, uploadObjectionVideo } from "@/lib/whatsapp/objection-video";
import {
  DEFAULT_AGENDA_HOURS,
  WEEKDAYS,
  type AgendaHours,
  type AgentExtraField,
  type AgentService,
  type KnowledgeItem,
  type ObjectionConfigItem,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MODELS = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini (rápido e econômico)" },
  { id: "gpt-4o", label: "gpt-4o (mais inteligente, mais caro)" },
];

const FOLLOWUP_LABELS = ["1º follow-up", "2º follow-up", "3º follow-up"];

// Estágio de follow-up exibido em HORAS na UI (persistido em minutos).
interface FollowupStageUi {
  horas: number;
  tom: string;
  mensagem: string;
}

const toStageUi = (s: { aposMinutos: number; tom: string; mensagem: string }): FollowupStageUi => ({
  horas: Math.max(1, Math.round(s.aposMinutos / 60)),
  tom: s.tom,
  mensagem: s.mensagem,
});

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
    promptInjectionEnabled: agent.promptInjectionEnabled,
  });
  const [improving, setImproving] = useState(false);
  // Progresso de upload POR card (índice) — permite subir vários vídeos em
  // paralelo sem um cancelar o outro (o estado único anterior era compartilhado:
  // iniciar o 2º trocava o índice e o finally do 1º derrubava o 2º).
  type UpProgress = { phase: "compressing" | "uploading"; ratio: number };
  const [uploads, setUploads] = useState<Record<number, UpProgress>>({});
  const setUploadAt = (idx: number, p: UpProgress | null) =>
    setUploads((u) => {
      if (p === null) {
        const next = { ...u };
        delete next[idx];
        return next;
      }
      return { ...u, [idx]: p };
    });
  const [extraFields, setExtraFields] = useState<AgentExtraField[]>(agent.extraFields);
  const [services, setServices] = useState<AgentService[]>(agent.agendaServices);
  const [hours, setHours] = useState<AgendaHours>(agent.agendaHours ?? DEFAULT_AGENDA_HOURS);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>(agent.knowledgeItems);
  const [objectionConfig, setObjectionConfig] = useState<ObjectionConfigItem[]>(
    agent.objectionConfig,
  );
  const [handoffPhone, setHandoffPhone] = useState(agent.handoffConfig.telefones[0] ?? "");
  const [followupEnabled, setFollowupEnabled] = useState(agent.followupConfig.enabled);
  const [confirmEnabled, setConfirmEnabled] = useState(agent.followupConfig.confirmEnabled);
  const [followupStages, setFollowupStages] = useState<FollowupStageUi[]>(
    agent.followupConfig.estagios.map(toStageUi),
  );

  // Re-sincroniza o estado local quando o agente mudar (outro cliente, dados atualizados).
  useEffect(() => {
    setForm({
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
      promptInjectionEnabled: agent.promptInjectionEnabled,
    });
    setExtraFields(agent.extraFields);
    setServices(agent.agendaServices);
    setHours(agent.agendaHours ?? DEFAULT_AGENDA_HOURS);
    setKnowledgeItems(agent.knowledgeItems);
    setObjectionConfig(agent.objectionConfig);
    setHandoffPhone(agent.handoffConfig.telefones[0] ?? "");
    setFollowupEnabled(agent.followupConfig.enabled);
    setConfirmEnabled(agent.followupConfig.confirmEnabled);
    setFollowupStages(agent.followupConfig.estagios.map(toStageUi));
  }, [agent]);

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

  const setKnowledge = (i: number, patch: Partial<KnowledgeItem>) =>
    setKnowledgeItems((ks) => ks.map((k, idx) => (idx === i ? { ...k, ...patch } : k)));
  const addKnowledge = () =>
    setKnowledgeItems((ks) => [...ks, { nome: "", descricao: "", valor: "" }]);
  const removeKnowledge = (i: number) =>
    setKnowledgeItems((ks) => ks.filter((_, idx) => idx !== i));

  const setObjection = (i: number, patch: Partial<ObjectionConfigItem>) =>
    setObjectionConfig((os) =>
      os.map((o, idx) => {
        if (idx !== i) return o;
        const next = { ...o, ...patch };
        // Slug interno acompanha o nome amigável (não é digitado pelo usuário).
        if (patch.rotulo !== undefined) {
          next.tipo = slugifyObjectionTipo(patch.rotulo);
        }
        return next;
      }),
    );
  const addObjection = () =>
    setObjectionConfig((os) => [
      ...os,
      { tipo: "", rotulo: "", gatilhos: [], video_url: "", abordagem: "" },
    ]);
  const removeObjection = (i: number) =>
    setObjectionConfig((os) => os.filter((_, idx) => idx !== i));
  const loadObjectionExamples = () =>
    setObjectionConfig([
      {
        tipo: "medo_receio_de_dor",
        rotulo: "Medo / receio de dor",
        gatilhos: ["medo", "dói", "dor", "receio"],
        video_url: "",
        abordagem:
          "Validar o receio; explicar técnicas modernas e anestesia; convidar sem compromisso.",
      },
      {
        tipo: "preco_investimento",
        rotulo: "Preço / investimento",
        gatilhos: ["caro", "não posso pagar", "tá puxado", "está caro"],
        video_url: "",
        abordagem:
          "Ancorar valor e resultado; falar em parcelamento; nunca oferecer desconto seco.",
      },
      {
        tipo: "distancia_deslocamento",
        rotulo: "Distância / deslocamento",
        gatilhos: ["longe", "moro longe", "outra cidade"],
        video_url: "",
        abordagem: "Prova social (pacientes de outras cidades); reforçar que vale o deslocamento.",
      },
    ]);

  const setFollowupStage = (i: number, patch: Partial<FollowupStageUi>) =>
    setFollowupStages((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

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
        knowledgeItems: knowledgeItems
          .map((k) => ({
            nome: k.nome.trim(),
            descricao: k.descricao.trim(),
            valor: k.valor.trim(),
          }))
          .filter((k) => k.nome),
        objectionConfig: objectionConfig
          .map((o) => {
            const rotulo = o.rotulo.trim();
            const tipo = slugifyObjectionTipo(rotulo) || o.tipo.trim().toLowerCase();
            return {
              tipo,
              rotulo,
              gatilhos: o.gatilhos.map((g) => g.trim()).filter(Boolean),
              video_url: o.video_url.trim(),
              abordagem: o.abordagem.trim(),
            };
          })
          .filter((o) => o.rotulo && o.tipo),
        handoffConfig: {
          telefones: handoffPhone.trim() ? [handoffPhone.trim()] : [],
        },
        followupConfig: {
          enabled: followupEnabled,
          confirmEnabled,
          estagios: followupStages.map((e) => ({
            aposMinutos: Math.max(1, Math.round(Number(e.horas) || 1)) * 60,
            tom: e.tom,
            mensagem: e.mensagem.trim(),
          })),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.agents() });
      toast.success("Configurações salvas.");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const handleImprove = async () => {
    setImproving(true);
    try {
      const improved = await improvePrompt(agent.id);
      if (improved) {
        set("systemPrompt", improved);
        toast.success("Prompt melhorado — revise e clique em Salvar.");
      } else {
        toast.error("Não foi possível gerar o prompt.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao melhorar o prompt.");
    } finally {
      setImproving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Configurações do agente</SheetTitle>
          <SheetDescription>{clientName}</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="basico" className="pb-6">
          <div className="overflow-x-auto">
            <TabsList className="w-max">
              <TabsTrigger value="basico">Básico</TabsTrigger>
              <TabsTrigger value="agenda">Agenda</TabsTrigger>
              <TabsTrigger value="followups">Follow-ups</TabsTrigger>
              <TabsTrigger value="avancado">Avançado</TabsTrigger>
              <TabsTrigger value="objecoes">Objeções em vídeo</TabsTrigger>
            </TabsList>
          </div>

          {/* ---------------- Básico ---------------- */}
          <TabsContent value="basico" className="space-y-4">
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">
                  Prompt do agente (personalidade e instruções)
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-2 text-xs"
                  disabled={improving}
                  onClick={handleImprove}
                  title="Melhorar o prompt com IA"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {improving ? "Melhorando…" : "Melhorar com IA"}
                </Button>
              </div>
              <Textarea
                rows={6}
                value={form.systemPrompt}
                onChange={(e) => set("systemPrompt", e.target.value)}
                placeholder="Você é o atendente da clínica X. Seu papel é qualificar leads e agendar avaliações…"
              />
            </div>

            <Field label="Informações do negócio (dados, ofertas, horários, FAQ)">
              <Textarea
                rows={5}
                value={form.businessInfo}
                onChange={(e) => set("businessInfo", e.target.value)}
                placeholder="Endereço, serviços, formas de pagamento, diferenciais, perguntas frequentes…"
              />
            </Field>

            {/* Serviços e valores — fonte de verdade de oferta/preço da IA. */}
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Serviços e valores</p>
                <p className="text-xs text-muted-foreground">
                  A IA usa esta lista como única fonte de verdade sobre oferta e preços.
                </p>
              </div>
              {knowledgeItems.length === 0 && (
                <p className="text-xs text-muted-foreground/70">
                  Nenhum item. Adicione o que a IA pode oferecer — ex.: Botox, descrição e valor.
                </p>
              )}
              {knowledgeItems.map((k, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="flex-[3]"
                      value={k.nome}
                      onChange={(e) => setKnowledge(i, { nome: e.target.value })}
                      placeholder="Nome (ex.: Botox full face)"
                    />
                    <Input
                      className="flex-[2]"
                      value={k.valor}
                      onChange={(e) => setKnowledge(i, { valor: e.target.value })}
                      placeholder="Valor (ex.: R$ 1.200)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeKnowledge(i)}
                      title="Remover item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    value={k.descricao}
                    onChange={(e) => setKnowledge(i, { descricao: e.target.value })}
                    placeholder="Descrição curta (benefícios, indicações, duração…)"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={addKnowledge}
              >
                <Plus className="h-4 w-4" /> Adicionar item
              </Button>
            </div>

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

            {/* Atendente humano — notificado quando a IA transfere a conversa. */}
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Atendente humano</p>
                <p className="text-xs text-muted-foreground">
                  A IA transfere a conversa e avisa este número quando o lead pedir para falar com
                  uma pessoa.
                </p>
              </div>
              <Field label="Telefone com DDI, ex.: 5534999990000">
                <Input
                  value={handoffPhone}
                  onChange={(e) => setHandoffPhone(e.target.value)}
                  placeholder="5534999990000"
                />
              </Field>
            </div>
          </TabsContent>

          {/* ---------------- Agenda ---------------- */}
          <TabsContent value="agenda" className="space-y-4">
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

            {form.agendaEnabled && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="pr-3">
                  <p className="text-sm font-medium">Confirmar consultas na véspera (~9h)</p>
                  <p className="text-xs text-muted-foreground">
                    No dia anterior à consulta a IA envia mensagem de confirmação e trata a resposta
                    (confirmar/remarcar/cancelar).
                  </p>
                </div>
                <Switch checked={confirmEnabled} onCheckedChange={setConfirmEnabled} />
              </div>
            )}
          </TabsContent>

          {/* ---------------- Follow-ups ---------------- */}
          <TabsContent value="followups" className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="pr-3">
                <p className="text-sm font-medium">Follow-ups automáticos</p>
                <p className="text-xs text-muted-foreground">
                  Reengaja leads que pararam de responder, em até 3 tentativas.
                </p>
              </div>
              <Switch checked={followupEnabled} onCheckedChange={setFollowupEnabled} />
            </div>

            <p className="text-xs text-muted-foreground">
              A IA avalia a conversa antes de cada follow-up — se o lead demonstrou que não quer
              mais contato, ela para de insistir e marca o lead como "não perturbar".
            </p>

            {followupStages.map((e, i) => (
              <Section key={i} title={FOLLOWUP_LABELS[i] ?? `${i + 1}º follow-up`}>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Enviar após X horas">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={e.horas}
                      onChange={(ev) => setFollowupStage(i, { horas: Number(ev.target.value) })}
                    />
                  </Field>
                  <Field label="Tom da mensagem">
                    <Input
                      value={e.tom}
                      onChange={(ev) => setFollowupStage(i, { tom: ev.target.value })}
                      placeholder="Ex.: leve — presuma que a pessoa se distraiu"
                    />
                  </Field>
                </div>
                <Field label="Mensagem (opcional)">
                  <Textarea
                    rows={2}
                    value={e.mensagem}
                    onChange={(ev) => setFollowupStage(i, { mensagem: ev.target.value })}
                    placeholder="Digite a mensagem exata deste follow-up — deixe vazio para a IA escrever na hora conforme o tom. Use ||| para quebrar em mensagens."
                  />
                </Field>
              </Section>
            ))}
          </TabsContent>

          {/* ---------------- Avançado ---------------- */}
          <TabsContent value="avancado" className="space-y-4">
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

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="pr-3">
                <p className="text-sm font-medium">Habilitar Prompt Injection</p>
                <p className="text-xs text-muted-foreground">
                  Aplica automaticamente boas práticas de atendimento (descoberta, tom, CTA,
                  anti-alucinação), adaptadas ao nicho — além do seu prompt.
                </p>
              </div>
              <Switch
                checked={form.promptInjectionEnabled}
                onCheckedChange={(v) => set("promptInjectionEnabled", v)}
              />
            </div>
          </TabsContent>

          <TabsContent value="objecoes" className="space-y-4">
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Quebra de objeções</p>
                <p className="text-xs text-muted-foreground">
                  Quando o lead falar algo parecido com as frases abaixo, a IA responde e pode
                  mandar o vídeo (uma vez por lead). O WhatsApp só entrega vídeo até ~16MB —
                  arquivos maiores são comprimidos automaticamente ao subir.
                </p>
              </div>

              {objectionConfig.length === 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground/70">
                    Nenhuma objeção cadastrada ainda. Use exemplos ou adicione a primeira (preço,
                    medo, distância…).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={loadObjectionExamples}
                    >
                      <Sparkles className="h-4 w-4" /> Carregar exemplos
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={addObjection}
                    >
                      <Plus className="h-4 w-4" /> Adicionar objeção
                    </Button>
                  </div>
                </div>
              )}

              {objectionConfig.map((o, i) => {
                const slug = slugifyObjectionTipo(o.rotulo) || o.tipo;
                const tipoDuplicado =
                  slug !== "" &&
                  objectionConfig.filter(
                    (x, j) =>
                      j !== i &&
                      (slugifyObjectionTipo(x.rotulo) || x.tipo).toLowerCase() ===
                        slug.toLowerCase(),
                  ).length > 0;
                const up = uploads[i];
                const isUploading = up != null;
                return (
                  <div key={i} className="space-y-3 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Objeção {i + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeObjection(i)}
                        title="Remover objeção"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <Field label="Nome da objeção">
                      <Input
                        value={o.rotulo}
                        onChange={(e) => setObjection(i, { rotulo: e.target.value })}
                        placeholder="Ex.: Preço / investimento"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Título interno para você identificar. A IA usa isso + as frases abaixo.
                      </p>
                    </Field>
                    {tipoDuplicado && (
                      <p className="text-xs text-destructive">
                        Já existe outra objeção com nome parecido — use nomes distintos.
                      </p>
                    )}

                    <Field label="Frases que o lead usa">
                      <GatilhosInput
                        value={o.gatilhos}
                        onCommit={(gatilhos) => setObjection(i, { gatilhos })}
                        placeholder="Ex.: está caro, não tenho dinheiro, tá puxado"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Separe por vírgula. São pistas para a IA reconhecer a objeção na conversa.
                      </p>
                    </Field>

                    <Field label="Como a IA deve responder">
                      <Textarea
                        rows={3}
                        value={o.abordagem}
                        onChange={(e) => setObjection(i, { abordagem: e.target.value })}
                        placeholder="Ex.: Validar o receio, ancorar valor, oferecer parcelamento; nunca dar desconto seco"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Orientação de tom e argumentos — não precisa ser o texto literal da
                        mensagem.
                      </p>
                    </Field>

                    <Field label="Vídeo de resposta (opcional)">
                      {o.video_url ? (
                        <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs">
                          <Video className="h-3.5 w-3.5 shrink-0 text-success" />
                          <span className="font-medium text-success">Vídeo anexado ✓</span>
                          <a
                            href={o.video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            assistir
                          </a>
                          <button
                            type="button"
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            onClick={() => setObjection(i, { video_url: "" })}
                            title="Remover vídeo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={isUploading}
                              onClick={() => {
                                const input = document.createElement("input");
                                input.type = "file";
                                input.accept = "video/*";
                                input.onchange = async () => {
                                  const file = input.files?.[0];
                                  if (!file) return;
                                  setUploadAt(i, { phase: "compressing", ratio: 0 });
                                  try {
                                    const { url, sizeBytes } = await uploadObjectionVideo(
                                      agent.id,
                                      file,
                                      (p) => setUploadAt(i, p),
                                    );
                                    setObjection(i, { video_url: url });
                                    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
                                    toast.success(
                                      `Vídeo pronto (~${mb} MB). Salve as configurações.`,
                                    );
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error ? err.message : "Falha no upload.",
                                    );
                                  } finally {
                                    setUploadAt(i, null);
                                  }
                                };
                                input.click();
                              }}
                            >
                              <Video className="h-4 w-4" />
                              {up
                                ? up.phase === "uploading"
                                  ? "Enviando…"
                                  : "Comprimindo…"
                                : "Subir vídeo"}
                            </Button>
                            {up && (
                              <span className="text-[11px] text-muted-foreground">
                                {up.phase === "compressing"
                                  ? "Comprimindo para WhatsApp…"
                                  : "Enviando…"}{" "}
                                {Math.round(up.ratio * 100)}%
                              </span>
                            )}
                          </div>
                          <Input
                            value={o.video_url}
                            onChange={(e) => setObjection(i, { video_url: e.target.value })}
                            placeholder="Ou cole a URL de um vídeo já leve (≤16MB)"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Pode subir arquivos grandes: comprimimos para ~16MB antes de enviar. Sem
                            vídeo, a IA responde só por texto.
                          </p>
                        </div>
                      )}
                    </Field>
                  </div>
                );
              })}

              {objectionConfig.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addObjection}
                >
                  <Plus className="h-4 w-4" /> Adicionar objeção
                </Button>
              )}
            </div>
          </TabsContent>

          <div className="pt-4">
            <Button
              className="w-full"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Salvando…" : "Salvar configurações"}
            </Button>
          </div>
        </Tabs>
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

// Campo de gatilhos separados por vírgula. Guarda o texto CRU em estado local
// enquanto o usuário digita (para não travar a vírgula/espaço) e só converte
// para array na hora de salvar. Re-sincroniza quando o valor externo muda e o
// campo não está em edição (ex.: trocou/removeu um card de objeção).
function GatilhosInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string[];
  onCommit: (v: string[]) => void;
  placeholder?: string;
}) {
  const canonical = value.join(", ");
  const [text, setText] = useState(canonical);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(canonical);
  }, [canonical, focused]);

  return (
    <Input
      value={text}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        onCommit(
          e.target.value
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
