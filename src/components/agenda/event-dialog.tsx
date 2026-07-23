import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  agendaKeys,
  createEvent,
  deleteEvent,
  updateEvent,
  type EventInput,
} from "@/lib/agenda/queries";
import { EVENT_TYPES, type AgendaEvent, type AgendaEventType } from "@/lib/agenda/types";
import { clientsKeys, fetchClients } from "@/lib/clients/queries";
import { useAuth } from "@/lib/auth";
import { TEAM_MEMBERS } from "@/lib/team";
import { cn } from "@/lib/utils";
import { TeamAvatar } from "@/components/team-avatar";
import { Button } from "@/components/ui/button";
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

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Evento a editar; ausente = criar. */
  event?: AgendaEvent | null;
  /** Data inicial sugerida (ISO) ao criar. */
  defaultDate?: Date | null;
}

// datetime-local usa horário local; converte ISO<->local.
const toLocalInput = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
const localToIso = (local: string) => new Date(local).toISOString();

export function EventDialog({ open, onOpenChange, event, defaultDate }: EventDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const editing = !!event;

  const [title, setTitle] = useState("");
  const [type, setType] = useState<AgendaEventType>("compromisso");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);

  const toggleAssignee = (email: string) =>
    setAssignees((a) => (a.includes(email) ? a.filter((e) => e !== email) : [...a, email]));

  const { data: clients } = useQuery({ queryKey: clientsKeys.list(), queryFn: fetchClients });

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setType(event.type);
      setStart(toLocalInput(event.startsAt));
      setEnd(toLocalInput(event.endsAt));
      setClientId(event.clientId ?? "none");
      setNotes(event.notes ?? "");
      setAssignees(event.assignees ?? []);
    } else {
      const base = defaultDate ?? new Date();
      base.setMinutes(0, 0, 0);
      const later = new Date(base.getTime() + 60 * 60 * 1000);
      setTitle("");
      setType("compromisso");
      setStart(format(base, "yyyy-MM-dd'T'HH:mm"));
      setEnd(format(later, "yyyy-MM-dd'T'HH:mm"));
      setClientId("none");
      setNotes("");
      // Ao criar, o responsável padrão é o próprio usuário (se for da equipe).
      const myEmail = user?.email?.toLowerCase();
      const mine = TEAM_MEMBERS.find((m) => m.email === myEmail)?.email;
      setAssignees(mine ? [mine] : []);
    }
  }, [open, event, defaultDate, user]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: agendaKeys.all });
  };

  const save = useMutation({
    mutationFn: () => {
      const payload: EventInput = {
        title: title.trim(),
        type,
        startsAt: localToIso(start),
        endsAt: localToIso(end),
        clientId: clientId === "none" ? null : clientId,
        notes: notes.trim() || null,
        assignees,
      };
      return editing ? updateEvent(event!.id, payload) : createEvent(payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success(editing ? "Compromisso atualizado." : "Compromisso criado.");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const remove = useMutation({
    mutationFn: () => deleteEvent(event!.id),
    onSuccess: () => {
      invalidate();
      toast.success("Compromisso removido.");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover."),
  });

  const canSave = title.trim() && start && end && new Date(end) > new Date(start);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
          <DialogDescription>Agenda interna da equipe Éden.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Reunião de alinhamento"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as AgendaEventType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Responsável</Label>
            <div className="flex flex-wrap gap-2">
              {TEAM_MEMBERS.map((m) => {
                const active = assignees.includes(m.email);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleAssignee(m.email)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <TeamAvatar member={m.key} className="h-4 w-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
            {assignees.length === 0 && (
              <p className="text-[11px] text-muted-foreground/70">
                Sem responsável: visível só para os donos.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Início</Label>
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fim</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cliente (opcional)</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {(clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notas (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2 className="h-4 w-4" /> Remover
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
