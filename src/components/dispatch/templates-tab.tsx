// Templates (HSM) por conta Cloud. Lista com status Meta, categoria, opt-out e
// preview do corpo. Botão "Sincronizar com a Meta" chama dispatch-admin
// (degrada com toast claro se WA_CLOUD_TOKEN ausente). Contas Evolution não têm
// templates.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { dispatchKeys, fetchAccounts, fetchTemplates } from "@/lib/dispatch/queries";
import { dispatchAdmin } from "@/lib/dispatch/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TemplateStatusBadge } from "./dispatch-ui";

export function TemplatesTab() {
  const qc = useQueryClient();
  const { data: accounts } = useQuery({
    queryKey: dispatchKeys.accounts(),
    queryFn: fetchAccounts,
  });
  const { data: templates } = useQuery({
    queryKey: dispatchKeys.templates(),
    queryFn: fetchTemplates,
  });

  const cloudAccounts = (accounts ?? []).filter((a) => a.provider === "cloud");

  const sync = useMutation({
    mutationFn: (accountId: string) => dispatchAdmin.syncTemplates(accountId),
    onSuccess: (r) => {
      toast.success(`${r.sincronizados} template(s) sincronizado(s).`);
      qc.invalidateQueries({ queryKey: dispatchKeys.templates() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (cloudAccounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium">Nenhuma conta Cloud API conectada</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Templates (HSM) só existem na WhatsApp Cloud API oficial. Conecte uma conta Meta para
          sincronizar e usar templates aprovados. Contas Evolution enviam apenas texto livre.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <span>
          Templates da categoria <b>MARKETING</b> precisam de instrução de opt-out (botão de
          descadastro ou texto tipo "responda SAIR para parar"). Sem isso, a campanha não pode ser
          disparada.
        </span>
      </div>

      {cloudAccounts.map((acc) => {
        const tpls = (templates ?? []).filter((t) => t.wa_account_id === acc.id);
        return (
          <div key={acc.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {acc.display_number || acc.waba_id || "Conta Cloud"}
              </h3>
              <Button
                variant="outline"
                size="sm"
                disabled={sync.isPending}
                onClick={() => sync.mutate(acc.id)}
              >
                <RefreshCw /> Sincronizar com a Meta
              </Button>
            </div>

            {tpls.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum template sincronizado. Clique em "Sincronizar com a Meta".
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {tpls.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{t.nome}</span>
                      <Badge variant="outline">{t.idioma}</Badge>
                      <Badge variant="secondary">{t.categoria}</Badge>
                      <TemplateStatusBadge status={t.status_meta} />
                      {t.tem_botao_optout ? (
                        <Badge variant="success">opt-out ✓</Badge>
                      ) : (
                        t.categoria === "MARKETING" && (
                          <Badge variant="destructive">sem opt-out</Badge>
                        )
                      )}
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">
                      {t.corpo}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
