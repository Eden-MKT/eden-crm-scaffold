import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import {
  appointmentKeys,
  cancelAppointment,
  createStaffAppointment,
  fetchAllAppointments,
  setAppointmentStatus,
  updateStaffAppointment,
  type Appointment,
} from "@/lib/agenda/appointments";
import type { BoardAppointmentStatus } from "@/lib/agenda/appointment-status";
import { fetchMarkeiMetrics, markeiKeys } from "@/lib/markei/queries";
import { cn } from "@/lib/utils";
import { ClinicorpWeekAgenda, currentWeekRange } from "@/components/agenda/clinicorp-week-agenda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Agenda de atendimentos (todas as IAs) — visão semanal estilo Clinicorp.
export function MarkeiAgenda() {
  const queryClient = useQueryClient();
  const initial = currentWeekRange();
  const [range, setRange] = useState({ from: initial.fromISO, to: initial.toISO });
  const [clientFilter, setClientFilter] = useState<string>("all"); // "all" | clientId

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formClientId, setFormClientId] = useState("");
  const [patient, setPatient] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("Atendimento");
  const [start, setStart] = useState("");

  const { data: metrics } = useQuery({
    queryKey: markeiKeys.metrics(),
    queryFn: () => fetchMarkeiMetrics(),
  });
  const agents = metrics?.porAgente ?? [];

  const { data: appointments, isLoading } = useQuery({
    queryKey: appointmentKeys.allClients(range.from, range.to),
    queryFn: () => fetchAllAppointments(range.from, range.to),
    refetchInterval: 30_000,
  });

  const visible = useMemo(() => {
    const list = appointments ?? [];
    if (clientFilter === "all") return list;
    return list.filter((a) => a.clientId === clientFilter);
  }, [appointments, clientFilter]);

  const selectedAgent =
    agents.find((a) => a.clientId === (formClientId || clientFilter)) ??
    (clientFilter !== "all" ? agents.find((a) => a.clientId === clientFilter) : undefined);

  const resetForm = () => {
    setEditingId(null);
    setPatient("");
    setPhone("");
    setService("Atendimento");
    setStart("");
    setFormClientId(clientFilter !== "all" ? clientFilter : "");
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (a: Appointment) => {
    setEditingId(a.id);
    setFormClientId(a.clientId);
    setPatient(a.patientName ?? "");
    setPhone(a.patientPhone ?? "");
    setService(a.serviceLabel ?? "Atendimento");
    setStart(format(new Date(a.startsAt), "yyyy-MM-dd'T'HH:mm"));
    setShowForm(true);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: appointmentKeys.all });
  };

  const save = useMutation({
    mutationFn: async () => {
      const durationMin = 60;
      if (editingId) {
        return updateStaffAppointment(editingId, {
          patientName: patient.trim(),
          patientPhone: phone.trim() || null,
          serviceLabel: service.trim() || "Atendimento",
          startsAt: new Date(start).toISOString(),
          durationMin,
        });
      }
      const agent =
        agents.find((a) => a.clientId === formClientId) ??
        (clientFilter !== "all" ? agents.find((a) => a.clientId === clientFilter) : undefined);
      if (!agent) throw new Error("Selecione uma IA / cliente.");
      return createStaffAppointment({
        clientId: agent.clientId,
        agentId: agent.agentId,
        patientName: patient.trim(),
        patientPhone: phone.trim() || null,
        serviceLabel: service.trim() || "Atendimento",
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
      setShowForm(false);
      resetForm();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cancelar."),
  });

  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BoardAppointmentStatus }) =>
      setAppointmentStatus(id, status),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar."),
  });

  const needsAgentPick = !editingId && clientFilter === "all";
  const canSave =
    patient.trim() &&
    start &&
    (editingId || formClientId || clientFilter !== "all");

  return (
    <main className="mx-auto flex h-full max-w-7xl flex-col gap-3 overflow-hidden p-4 md:p-6">
      {agents.length > 1 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <FilterChip
            label="Todas"
            active={clientFilter === "all"}
            onClick={() => setClientFilter("all")}
          />
          {agents.map((a) => (
            <FilterChip
              key={a.agentId}
              label={a.nome}
              active={clientFilter === a.clientId}
              onClick={() => setClientFilter(a.clientId)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <div className="grid shrink-0 gap-3 rounded-lg border border-border p-3">
          {editingId && (
            <p className="text-xs font-medium text-primary">
              Editando agendamento — altere o que precisar e salve.
            </p>
          )}
          {needsAgentPick && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">IA / Cliente</Label>
              <Select value={formClientId} onValueChange={setFormClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.agentId} value={a.clientId}>
                      {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!needsAgentPick && selectedAgent && !editingId && (
            <p className="text-xs text-muted-foreground">Criando em: {selectedAgent.nome}</p>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Paciente</Label>
            <Input
              value={patient}
              onChange={(e) => setPatient(e.target.value)}
              placeholder="Nome"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Telefone (opcional)</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="DDD + número"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Serviço</Label>
              <Input
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="Atendimento"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Início</Label>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
              {save.isPending
                ? "Salvando…"
                : editingId
                  ? "Salvar alterações"
                  : "Confirmar agendamento"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(editingId)}
              >
                Cancelar agendamento
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              Fechar
            </Button>
          </div>
        </div>
      )}

      <ClinicorpWeekAgenda
        className="min-h-0 flex-1"
        appointments={visible}
        isLoading={isLoading}
        onWeekChange={(from, to) => setRange({ from, to })}
        onNew={openCreate}
        onItemClick={(id) => {
          const appt = visible.find((a) => a.id === id);
          if (appt) openEdit(appt);
        }}
        onStatusChange={(id, status) => mark.mutate({ id, status })}
      />
    </main>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
