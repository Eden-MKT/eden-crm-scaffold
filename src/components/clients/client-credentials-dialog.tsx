import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Instagram } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import {
  credentialsKeys,
  fetchClientCredentials,
  upsertClientCredentials,
} from "@/lib/clients/credentials-queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ClientCredentialsDialogProps {
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientCredentialsDialog({
  clientId,
  clientName,
  open,
  onOpenChange,
}: ClientCredentialsDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [instagramLogin, setInstagramLogin] = useState("");
  const [instagramPassword, setInstagramPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { data: credentials, isLoading } = useQuery({
    queryKey: credentialsKeys.byClient(clientId),
    queryFn: () => fetchClientCredentials(clientId),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (credentials) {
      setInstagramLogin(credentials.instagramLogin);
      setInstagramPassword(credentials.instagramPassword);
      setNotes(credentials.notes);
    } else if (!isLoading) {
      setInstagramLogin("");
      setInstagramPassword("");
      setNotes("");
    }
    setShowPassword(false);
  }, [open, credentials, isLoading]);

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertClientCredentials(clientId, {
        instagramLogin,
        instagramPassword,
        notes,
        updatedBy: user?.email ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: credentialsKeys.byClient(clientId) });
      toast.success("Credenciais salvas.");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Não foi possível salvar as credenciais.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Credenciais</DialogTitle>
          <DialogDescription>
            Acessos e anotações de <span className="font-medium text-foreground">{clientName}</span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-5">
            {/* Bloco Instagram */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 text-white shadow-sm">
                  <Instagram className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">Instagram</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="instagram-login" className="text-xs text-muted-foreground">
                    Login
                  </Label>
                  <Input
                    id="instagram-login"
                    value={instagramLogin}
                    onChange={(e) => setInstagramLogin(e.target.value)}
                    placeholder="usuario ou e-mail"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="instagram-password" className="text-xs text-muted-foreground">
                    Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="instagram-password"
                      type={showPassword ? "text" : "password"}
                      value={instagramPassword}
                      onChange={(e) => setInstagramPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="off"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloco de notas */}
            <div className="space-y-1.5">
              <Label htmlFor="credentials-notes" className="text-xs text-muted-foreground">
                Bloco de notas
              </Label>
              <Textarea
                id="credentials-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anotações gerais: BM, Google Ads, acessos extras..."
                className="min-h-[200px] resize-y border-amber-200/60 bg-amber-50/50 font-mono text-sm leading-relaxed dark:border-amber-900/40 dark:bg-amber-950/20"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
