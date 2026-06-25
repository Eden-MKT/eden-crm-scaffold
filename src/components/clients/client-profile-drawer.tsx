import { Building2, Mail, Phone } from "lucide-react";

import { STAGE_MAP } from "@/lib/clients/stages";
import { paymentMethodLabel } from "@/lib/clients/payment-methods";
import { billingTypeLabel } from "@/lib/clients/billing-types";
import type { Client } from "@/lib/clients/types";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ExpenseManager } from "@/components/finance/expense-manager";

import { ClientFilesSection } from "./client-files-section";
import { StageBadge } from "./stage-badge";

interface ClientProfileDrawerProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientProfileDrawer({ client, open, onOpenChange }: ClientProfileDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {client && (
          <>
            <SheetHeader>
              <SheetTitle>{client.name}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <StageBadge stage={client.stage} />
                {STAGE_MAP[client.stage]?.label}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <section className="space-y-2 text-sm">
                {client.company && <InfoRow icon={Building2} value={client.company} />}
                {client.email && <InfoRow icon={Mail} value={client.email} />}
                {client.phone && <InfoRow icon={Phone} value={client.phone} />}
              </section>

              <Separator />

              <section className="grid grid-cols-2 gap-4 text-sm">
                <Stat label="Valor do contrato" value={formatCurrencyBRL(client.contractValue)} />
                <Stat label="Plano de pagamento" value={billingTypeLabel(client.billingType)} />
                <Stat label="Forma de pagamento" value={paymentMethodLabel(client.paymentMethod)} />
                <Stat
                  label="Parcelas"
                  value={client.installments ? `${client.installments}x` : "—"}
                />
                <Stat label="Cadastrado em" value={formatDate(client.createdAt)} />
                <Stat label="Atualizado em" value={formatDate(client.updatedAt)} />
              </section>

              <Separator />

              <ExpenseManager scope="cliente" clientId={client.id} title="Despesas do projeto" />

              <Separator />

              <ClientFilesSection clientId={client.id} uploadCategory="material" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <p className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span className="text-foreground">{value}</span>
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
