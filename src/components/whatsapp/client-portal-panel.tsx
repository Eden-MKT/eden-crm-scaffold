import { useEffect, useState } from "react";
import { Copy, KeyRound, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";

import { portalManager, type PortalCredentials } from "@/lib/portal/manager";
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

interface ClientPortalPanelProps {
  clientId: string;
  clientName: string;
  clientEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientPortalPanel({
  clientId,
  clientName,
  clientEmail,
  open,
  onOpenChange,
}: ClientPortalPanelProps) {
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [email, setEmail] = useState(clientEmail || "");
  const [creds, setCreds] = useState<PortalCredentials | null>(null);
  const [busy, setBusy] = useState(false);

  const portalUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/portal`;

  useEffect(() => {
    if (!open) return;
    setCreds(null);
    setLoading(true);
    portalManager
      .status(clientId)
      .then((s) => {
        setExists(s.exists);
        if (s.email) setEmail(s.email);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, clientId]);

  const create = async () => {
    if (!email.includes("@")) {
      toast.error("Informe um email válido.");
      return;
    }
    setBusy(true);
    try {
      const r = await portalManager.create(clientId, email.trim().toLowerCase());
      setCreds(r);
      setExists(true);
      if (r.password) toast.success("Painel criado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar painel.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const r = await portalManager.resetPassword(clientId);
      setCreds(r);
      toast.success("Nova senha gerada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao redefinir.");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copiado!"))
      .catch(() => {});

  const copyAll = () => {
    if (!creds?.password) return;
    copy(
      `Portal Éden Marketing\nAcesse: ${portalUrl}\nEmail: ${creds.email}\nSenha: ${creds.password}`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Painel do cliente
          </DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Verificando…</p>
        ) : (
          <div className="space-y-4">
            {!creds && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Email de acesso do cliente</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  disabled={exists}
                />
                {exists && (
                  <p className="text-xs text-muted-foreground">
                    Painel já criado para este email. Você pode redefinir a senha.
                  </p>
                )}
              </div>
            )}

            {creds?.password && (
              <div className="space-y-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
                <p className="font-medium">Credenciais (mostradas só agora):</p>
                <Row label="Link" value={portalUrl} onCopy={() => copy(portalUrl)} />
                <Row label="Email" value={creds.email} onCopy={() => copy(creds.email)} />
                <Row label="Senha" value={creds.password} onCopy={() => copy(creds.password!)} />
                <Button size="sm" className="mt-1 w-full gap-2" onClick={copyAll}>
                  <Copy className="h-4 w-4" /> Copiar tudo para enviar
                </Button>
              </div>
            )}

            <div className="grid gap-2">
              {!exists ? (
                <Button onClick={create} disabled={busy} className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  {busy ? "Criando…" : "Criar painel do cliente"}
                </Button>
              ) : (
                <Button variant="outline" onClick={reset} disabled={busy} className="gap-2">
                  <KeyRound className="h-4 w-4" />
                  {busy ? "Gerando…" : "Redefinir senha"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-background/60 px-2 py-1 text-xs">
        {value}
      </code>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCopy}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
