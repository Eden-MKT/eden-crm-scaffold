// Lista de campanhas + criação (wizard) + exclusão de rascunhos.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteCampaign, dispatchKeys } from "@/lib/dispatch/queries";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CampaignStatusBadge, fmtDate } from "./dispatch-ui";
import { CampaignWizard } from "./campaign-wizard";

interface CampaignListRow {
  id: string;
  nome: string;
  status: string;
  created_at: string;
  disparado_em: string | null;
  conta: string;
  conteudo: string;
}

async function fetchCampaignList(): Promise<CampaignListRow[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, wa_accounts(display_number, evolution_instance, provider), wa_templates(nome)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  type Joined = {
    id: string;
    nome: string;
    status: string;
    created_at: string;
    disparado_em: string | null;
    wa_accounts: {
      display_number: string | null;
      evolution_instance: string | null;
      provider: string;
    } | null;
    wa_templates: { nome: string } | null;
  };
  return ((data ?? []) as unknown as Joined[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    status: c.status,
    created_at: c.created_at,
    disparado_em: c.disparado_em,
    conta:
      c.wa_accounts?.display_number ||
      c.wa_accounts?.evolution_instance ||
      c.wa_accounts?.provider ||
      "—",
    conteudo: c.wa_templates?.nome ? `Template: ${c.wa_templates.nome}` : "Texto livre",
  }));
}

export function CampaignsTab() {
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data } = useQuery({ queryKey: dispatchKeys.campaigns(), queryFn: fetchCampaignList });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: dispatchKeys.campaigns() });
    qc.invalidateQueries({ queryKey: dispatchKeys.monitor() });
  };

  const del = useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: () => {
      toast.success("Rascunho excluído.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setWizardOpen(true)}>
          <Plus /> Nova campanha
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Conteúdo</TableHead>
              <TableHead>Criada</TableHead>
              <TableHead>Disparada</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nenhuma campanha. Crie a primeira.
                </TableCell>
              </TableRow>
            ) : (
              data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>
                    <CampaignStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>{c.conta}</TableCell>
                  <TableCell className="text-xs">{c.conteudo}</TableCell>
                  <TableCell className="text-xs">{fmtDate(c.created_at)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(c.disparado_em)}</TableCell>
                  <TableCell>
                    {c.status === "rascunho" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" title="Excluir rascunho">
                            <Trash2 className="text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir rascunho "{c.nome}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A campanha e sua fila serão removidas. Contatos e supressões não são
                              afetados.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => del.mutate(c.id)}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} onLaunched={refresh} />
    </div>
  );
}
