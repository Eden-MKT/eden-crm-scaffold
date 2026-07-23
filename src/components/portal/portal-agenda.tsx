import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import {
  cancelPortalAppointment,
  createPortalAppointment,
  fetchPortalAgenda,
  portalAgendaKeys,
  setPortalAppointmentStatus,
  updatePortalAppointment,
  type PortalAppointment,
} from "@/lib/portal/agenda";
import { portalKeys } from "@/lib/portal/queries";
import type { BoardAppointmentStatus } from "@/lib/agenda/appointment-status";
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

export function PortalAgenda() {
  const queryClient = useQueryClient();
  const initial = currentWeekRange();
  const [range, setRange] = useState({ from: initial.fromISO, to: initial.toISO });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [patient, setPatient] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [start, setStart] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: portalAgendaKeys.list(range.from, range.to),
    queryFn: () => fetchPortalAgenda(range.from, range.to),
    refetchInterval: 30_000,
  });

  const services = data?.services ?? [];
  const appts = data?.appointments ?? [];

  const resetForm = () => {
    setEditingId(null);
    setPatient("");
    setPhone("");
    setService("");
    setStart("");
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (a: PortalAppointment) => {
    setEditingId(a.id);
    setPatient(a.patientName ?? "");
    setPhone(a.patientPhone ?? "");
    setService(a.serviceLabel ?? "");
    setStart(format(new Date(a.startsAt), "yyyy-MM-dd'T'HH:mm"));
    setShowForm(true);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: portalAgendaKeys.all });
    queryClient.invalidateQueries({ queryKey: portalKeys.metrics() });
  };

  const save = useMutation({
    mutationFn: () => {
      if (editingId) {
        return updatePortalAppointment({
          appointmentId: editingId,
          patientName: patient.trim(),
          patientPhone: phone.trim(),
          serviceLabel: service || undefined,
          startsAt: new Date(start).toISOString(),
        });
      }
      return createPortalAppointment({
        patientName: patient.trim(),
        patientPhone: phone.trim() || undefined,
        serviceLabel: service || services[0]?.label,
        startsAt: new Date(start).toISOString(),
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
    mutationFn: (id: string) => cancelPortalAppointment(id),
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
      setPortalAppointmentStatus(id, status),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar."),
  });

  const canCreate = patient.trim() && start;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {showForm && (
        <div className="grid shrink-0 gap-3 rounded-lg border border-border p-3">
          {editingId && (
            <p className="text-xs font-medium text-primary">
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
          <div className="grid grid-cols-2 gap-3">
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
                  <SelectValue placeholder={services[0]?.label ?? "Atendimento"} />
                </SelectTrigger>
                <SelectContent>
                  {services.length === 0 && (
                    <SelectItem value="Atendimento">Atendimento</SelectItem>
                  )}
                  {services.map((s) => (
                    <SelectItem key={s.label} value={s.label}>
                      {s.label} ({s.durationMin} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Início</Label>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!canCreate || save.isPending} onClick={() => save.mutate()}>
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
        appointments={appts}
        isLoading={isLoading}
        onWeekChange={(from, to) => setRange({ from, to })}
        onNew={openCreate}
        onItemClick={(id) => {
          const appt = appts.find((a) => a.id === id);
          if (appt) openEdit(appt);
        }}
        onStatusChange={(id, status) => mark.mutate({ id, status })}
      />
    </div>
  );
}
