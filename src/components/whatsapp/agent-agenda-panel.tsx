import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarPlus, Check, Clock, Bot, Pencil, RotateCcw, User, UserX, X } from "lucide-react";
import { toast } from "sonner";

import {
  appointmentKeys,
  cancelAppointment,
  createStaffAppointment,
  fetchClientAppointments,
  setAppointmentStatus,
  updateStaffAppointment,
  type Appointment,
} from "@/lib/agenda/appointments";
import type { WhatsappAgent } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";
import { defaultPeriod, PeriodFilter } from "@/components/agenda/period-filter";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgentAgendaPanelProps {
  agent: WhatsappAgent;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const sourceBadge: Record<Appointment["source"], { label: string; icon: typeof Bot }> = {
  ai: { label: "IA", icon: Bot },
  staff: { label: "Equipe", icon: User },
  client: { label: "Cliente", icon: User },
};

export function AgentAgendaPanel({ agent, clientName, open, onOpenChange }: AgentAgendaPanelProps) {
  const queryClient = useQueryClient();
  const services = agent.agendaServices;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [patient, setPatient] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState(services[0]?.label ?? "");
  const [start, setStart] = useState("");
  const [period, setPeriod] = useState(defaultPeriod);

  const fromISO = period.from.toISOString();
  const toISO = period.to.toISOString();
  const { data: appts } = useQuery({
    queryKey: appointmentKeys.byClient(agent.clientId, fromISO, toISO),
    queryFn: () => fetchClientAppointments(agent.clientId, fromISO, toISO),
    enabled: open,
  });

  const resetForm = () => {
    setEditingId(null);
    setPatient("");
    setPhone("");
    setService(services[0]?.label ?? "");
    setStart("");
  };

  const openEdit = (a: Appointment) => {
    setEditingId(a.id);
    setPatient(a.patientName ?? "");
    setPhone(a.patientPhone ?? "");
    setService(a.serviceLabel ?? services[0]?.label ?? "");
    setStart(format(new Date(a.startsAt), "yyyy-MM-dd'T'HH:mm"));
    setShowForm(true);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appts ?? []) {
      const key = format(new Date(a.startsAt), "yyyy-MM-dd");
      (map.get(key) ?? map.set(key, []).get(key)!).push(a);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [appts]);

  // Invalida todas as janelas de período do cliente (prefixo).
  const invalidate = () => queryClient.invalidateQueries({ queryKey: appointmentKeys.all });

  const save = useMutation({
    mutationFn: () => {
      const svc = services.find((s) => s.label === service);
      const durationMin = svc?.durationMin ?? 60;
      if (editingId) {
        return updateStaffAppointment(editingId, {
          patientName: patient.trim(),
          patientPhone: phone.trim() || null,
          serviceLabel: service || "Atendimento",
          startsAt: new Date(start).toISOString(),
          durationMin,
        });
      }
      return createStaffAppointment({
        clientId: agent.clientId,
        agentId: agent.id,
        patientName: patient.trim(),
        patientPhone: phone.trim() || null,
        serviceLabel: service || "Atendimento",
        startsAt: new Date(start).toISOString(),
        durationMin,
        notes: null,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success(editingId ? "Agendamento atualizado." : "Agendamento criado.");
      setShowForm(false);
      resetForm();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    onSuccess: () => {
      invalidate();
      toast.success("Agendamento cancelado.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cancelar."),
  });

  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "completed" | "no_show" | "scheduled" }) =>
      setAppointmentStatus(id, status),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar."),
  });

  const canCreate = patient.trim() && service && start;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[96vw] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Agenda — {clientName}
          </DialogTitle>
          <DialogDescription>
            Consultas e procedimentos agendados pela IA, pela equipe ou pelo cliente.
          </DialogDescription>
        </DialogHeader>

        <PeriodFilter value={period} onChange={setPeriod} />

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {(appts ?? []).length} agendamento(s) no período
          </p>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                resetForm();
              } else {
                resetForm();
                setShowForm(true);
              }
            }}
          >
            <CalendarPlus className="h-4 w-4" /> {showForm ? "Fechar" : "Novo agendamento"}
          </Button>
        </div>

        {showForm && (
          <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            {editingId && (
              <p className="text-xs font-medium text-primary sm:col-span-2">
                Editando agendamento — altere o que precisar e salve.
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Paciente</Label>
              <Input
                value={patient}
                onChange={(e) => setPatient(e.target.value)}
                placeholder="Nome"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Telefone (opcional)</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="DDD + número"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {services.length === 0 && (
                    <SelectItem value="Atendimento">Atendimento (60 min)</SelectItem>
                  )}
                  {services.map((s) => (
                    <SelectItem key={s.label} value={s.label}>
                      {s.label} ({s.durationMin} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Início</Label>
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                className="w-full"
                disabled={!canCreate || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending
                  ? "Salvando…"
                  : editingId
                    ? "Salvar alterações"
                    : "Confirmar agendamento"}
              </Button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {grouped.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum agendamento no período selecionado.
            </p>
          )}
          {grouped.map(([day, items]) => (
            <div key={day}>
              <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                {format(new Date(`${day}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </p>
              <ul className="space-y-1.5">
                {items.map((a) => {
                  const Badge = sourceBadge[a.source];
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                    >
                      <div className="w-14 shrink-0 text-center">
                        <p className="text-sm font-semibold">
                          {format(new Date(a.startsAt), "HH:mm")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{a.durationMin}min</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{a.patientName || "Sem nome"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.serviceLabel}
                          {a.patientPhone ? ` · ${a.patientPhone}` : ""}
                        </p>
                      </div>
                      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
                        <Badge.icon className="h-3 w-3" /> {Badge.label}
                      </span>

                      {/* Presença */}
                      {a.status === "scheduled" ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs text-success hover:text-success"
                            onClick={() => mark.mutate({ id: a.id, status: "completed" })}
                            title="Compareceu"
                          >
                            <Check className="h-3.5 w-3.5" /> Veio
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => mark.mutate({ id: a.id, status: "no_show" })}
                            title="Não compareceu"
                          >
                            <UserX className="h-3.5 w-3.5" /> Faltou
                          </Button>
                        </div>
                      ) : (
                        <span
                          className={cn(
                            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            a.status === "completed"
                              ? "bg-success/15 text-success"
                              : "bg-destructive/15 text-destructive",
                          )}
                        >
                          {a.status === "completed" ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <UserX className="h-3 w-3" />
                          )}
                          {a.status === "completed" ? "Compareceu" : "Faltou"}
                          <button
                            type="button"
                            className="ml-0.5 opacity-70 hover:opacity-100"
                            onClick={() => mark.mutate({ id: a.id, status: "scheduled" })}
                            title="Desfazer"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        </span>
                      )}

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                        onClick={() => openEdit(a)}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => cancel.mutate(a.id)}
                        title="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
