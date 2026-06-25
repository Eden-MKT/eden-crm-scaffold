import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createExpense,
  deleteEntry,
  fetchClientExpenses,
  fetchCompanyExpenses,
  financeKeys,
  setEntryStatus,
} from "@/lib/finance/queries";
import type { FinanceEntry } from "@/lib/finance/types";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const schema = z.object({
  description: z.string().min(1, "Descreva a despesa"),
  amount: z.coerce.number().min(0, "Valor inválido"),
  dueDate: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface ExpenseManagerProps {
  /** "empresa" = despesas gerais; "cliente" = despesas do projeto de um cliente. */
  scope: "empresa" | "cliente";
  clientId?: string;
  title?: string;
}

export function ExpenseManager({ scope, clientId, title }: ExpenseManagerProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const queryKey =
    scope === "empresa" ? financeKeys.list() : financeKeys.clientExpenses(clientId ?? "");

  const { data: expenses, isLoading } = useQuery({
    queryKey: scope === "empresa" ? ["finance", "company-expenses"] : queryKey,
    queryFn: () =>
      scope === "empresa" ? fetchCompanyExpenses() : fetchClientExpenses(clientId ?? ""),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: financeKeys.all });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: 0 },
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createExpense({
        description: values.description,
        amount: values.amount,
        dueDate: values.dueDate || null,
        category: scope === "empresa" ? "empresa" : "projeto_cliente",
        clientId: scope === "cliente" ? clientId : null,
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Despesa cadastrada.");
      form.reset({ amount: 0, description: "", dueDate: "" });
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao salvar."),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pendente" | "pago" }) =>
      setEntryStatus(id, status),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => {
      invalidate();
      toast.success("Despesa removida.");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{title ?? "Despesas"}</h4>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Nova despesa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cadastrar despesa</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <Input
                  {...form.register("description")}
                  placeholder="Ex.: Tráfego pago, ferramenta, fornecedor…"
                />
                {form.formState.errors.description && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                  <Input type="number" step="0.01" min="0" {...form.register("amount")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Vencimento</Label>
                  <Input type="date" {...form.register("dueDate")} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando…" : "Salvar despesa"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && (expenses?.length ?? 0) === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Nenhuma despesa cadastrada.
        </p>
      )}

      <ul className="space-y-2">
        {expenses?.map((e) => (
          <ExpenseRow
            key={e.id}
            entry={e}
            onToggle={() =>
              statusMutation.mutate({
                id: e.id,
                status: e.status === "pago" ? "pendente" : "pago",
              })
            }
            onDelete={() => deleteMutation.mutate(e.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ExpenseRow({
  entry,
  onToggle,
  onDelete,
}: {
  entry: FinanceEntry;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const overdue =
    entry.status === "pendente" &&
    entry.dueDate != null &&
    entry.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 p-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{entry.description}</p>
        <p className="text-[11px] text-muted-foreground">
          {entry.dueDate ? `Vence ${formatDate(entry.dueDate)}` : "Sem prazo"}
          {overdue && " · atrasada"}
        </p>
      </div>
      <span className="text-sm font-semibold text-foreground">
        {formatCurrencyBRL(entry.amount)}
      </span>
      <Badge variant={entry.status === "pago" ? "success" : overdue ? "destructive" : "warning"}>
        {entry.status === "pago" ? "Pago" : "Pendente"}
      </Badge>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        title={entry.status === "pago" ? "Marcar pendente" : "Marcar pago"}
        onClick={onToggle}
      >
        {entry.status === "pago" ? (
          <RotateCcw className="h-4 w-4" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
