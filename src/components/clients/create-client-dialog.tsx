import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { STAGES } from "@/lib/clients/stages";
import { PAYMENT_METHODS } from "@/lib/clients/payment-methods";
import { BILLING_TYPES, BILLING_TYPE_MAP } from "@/lib/clients/billing-types";
import { clientsKeys, createClient } from "@/lib/clients/queries";
import { uploadClientFile } from "@/lib/clients/files";
import { createRevenueForClient, financeKeys } from "@/lib/finance/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  name: z.string().min(1, "Informe o nome do contato"),
  company: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  stage: z.enum([
    "kickoff",
    "site_infra",
    "tracking_dados",
    "crm_integracoes",
    "pesquisa_planejamento",
    "criativos",
    "estrutura_campanha",
    "gestao_continua",
    "relatorios_bi",
    "otimizacao_escala",
    "manutencao",
    "churn",
  ]),
  paymentMethod: z
    .enum(["pix", "boleto", "cartao_credito", "transferencia", "dinheiro"])
    .optional(),
  contractValue: z.coerce.number().min(0, "Valor inválido"),
  billingType: z.enum(["avista", "recorrente", "parcelado"]),
  installments: z.coerce.number().int().min(2).max(48).optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateClientDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { stage: "kickoff", contractValue: 0, billingType: "avista" },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const client = await createClient({
        name: values.name,
        company: values.company,
        email: values.email,
        phone: values.phone,
        stage: values.stage,
        paymentMethod: values.paymentMethod ?? null,
        contractValue: values.contractValue,
        billingType: values.billingType,
        installments: values.billingType === "parcelado" ? values.installments : null,
      });

      // Gera os lançamentos de receita no Financeiro a partir do plano.
      await createRevenueForClient(client);

      if (contractFile) {
        await uploadClientFile({
          clientId: client.id,
          file: contractFile,
          category: "contract",
        });
      }
      for (const file of additionalFiles) {
        await uploadClientFile({
          clientId: client.id,
          file,
          category: "additional",
        });
      }
      return client;
    },
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.all });
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success(`Cliente "${client.name}" cadastrado.`);
      handleClose(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar cliente.");
    },
  });

  const handleClose = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset({ stage: "kickoff", contractValue: 0, billingType: "avista" });
      setContractFile(null);
      setAdditionalFiles([]);
    }
  };

  const stage = watch("stage");
  const paymentMethod = watch("paymentMethod");
  const billingType = watch("billingType");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full gap-2 sm:w-auto">
          <Plus className="h-4 w-4" />
          Cadastrar Cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar Cliente</DialogTitle>
          <DialogDescription>
            Preencha os dados do cliente e anexe o contrato e materiais.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do contato" error={errors.name?.message}>
              <Input {...register("name")} placeholder="Ana Souza" />
            </Field>
            <Field label="Empresa">
              <Input {...register("company")} placeholder="Padaria Flor" />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" {...register("email")} placeholder="ana@empresa.com" />
            </Field>
            <Field label="Telefone">
              <Input {...register("phone")} placeholder="(11) 99999-9999" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Etapa inicial">
              <Select
                value={stage}
                onValueChange={(v) => setValue("stage", v as FormValues["stage"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Forma de pagamento">
              <Select
                value={paymentMethod}
                onValueChange={(v) => setValue("paymentMethod", v as FormValues["paymentMethod"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plano de pagamento">
              <Select
                value={billingType}
                onValueChange={(v) => setValue("billingType", v as FormValues["billingType"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_TYPES.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {billingType === "parcelado" ? (
              <Field label="Nº de parcelas" error={errors.installments?.message}>
                <Input
                  type="number"
                  step="1"
                  min="2"
                  max="48"
                  {...register("installments")}
                  placeholder="12"
                />
              </Field>
            ) : (
              <div />
            )}
          </div>

          <Field
            label={BILLING_TYPE_MAP[billingType].amountLabel}
            error={errors.contractValue?.message}
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              {...register("contractValue")}
              placeholder="0,00"
            />
          </Field>

          <Field label="Contrato gerado (PDF)">
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
            />
          </Field>

          <Field label="Arquivos adicionais">
            <Input
              type="file"
              multiple
              onChange={(e) => setAdditionalFiles(Array.from(e.target.files ?? []))}
            />
            {additionalFiles.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {additionalFiles.length} arquivo(s) selecionado(s)
              </p>
            )}
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando…" : "Salvar cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
