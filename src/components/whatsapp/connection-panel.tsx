import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, QrCode, RefreshCw, Power } from "lucide-react";
import { toast } from "sonner";

import { evolutionManager } from "@/lib/whatsapp/manager";
import { whatsappKeys } from "@/lib/whatsapp/queries";
import type { WhatsappAgent } from "@/lib/whatsapp/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConnectionBadge } from "./status-badge";

interface ConnectionPanelProps {
  agent: WhatsappAgent;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionPanel({ agent, clientName, open, onOpenChange }: ConnectionPanelProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(agent.status);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const hasInstance = Boolean(agent.instanceName);

  const refreshStatus = async () => {
    try {
      const r = await evolutionManager.status(agent.id);
      setStatus(r.status as typeof status);
      if (r.status === "connected") {
        setQr(null);
        queryClient.invalidateQueries({ queryKey: whatsappKeys.agents() });
      }
    } catch {
      /* ignore */
    }
  };

  // Poll de status enquanto o painel está aberto e não conectado.
  useEffect(() => {
    if (!open || !hasInstance) return;
    refreshStatus();
    const id = setInterval(refreshStatus, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasInstance, agent.id]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(null);
    }
  };

  const createAndQr = () =>
    run("create", async () => {
      await evolutionManager.createInstance(agent.id);
      queryClient.invalidateQueries({ queryKey: whatsappKeys.agents() });
      const r = await evolutionManager.qr(agent.id);
      setQr(r.base64);
      setStatus("connecting");
    });

  const genQr = () =>
    run("qr", async () => {
      const r = await evolutionManager.qr(agent.id);
      setQr(r.base64);
    });

  const publicLink = () =>
    run("link", async () => {
      const r = await evolutionManager.generateConnectToken(agent.id);
      const url = `${window.location.origin}/conectar/${r.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Link copiado! Envie ao cliente.", { description: url });
    });

  const disconnect = () =>
    run("logout", async () => {
      await evolutionManager.logout(agent.id);
      setStatus("disconnected");
      setQr(null);
      queryClient.invalidateQueries({ queryKey: whatsappKeys.agents() });
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conexão do WhatsApp</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="text-sm">
              <p className="font-medium">Status</p>
              {agent.phoneNumber && (
                <p className="text-xs text-muted-foreground">+{agent.phoneNumber}</p>
              )}
            </div>
            <ConnectionBadge status={status} />
          </div>

          {qr && status !== "connected" && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
              <img
                src={`data:image/png;base64,${qr.replace(/^data:image\/\w+;base64,/, "")}`}
                alt="QR code"
                className="h-56 w-56 rounded-md bg-white p-2"
              />
              <p className="text-center text-xs text-muted-foreground">
                Abra o WhatsApp → Aparelhos conectados → Conectar aparelho. O QR expira em ~40s;
                gere outro se necessário.
              </p>
            </div>
          )}

          {status === "connected" && (
            <p className="rounded-lg border border-success/40 bg-success/10 p-3 text-center text-sm text-foreground">
              ✅ Conectado e pronto para responder.
            </p>
          )}

          <div className="grid gap-2">
            {!hasInstance ? (
              <Button onClick={createAndQr} disabled={busy !== null} className="gap-2">
                <QrCode className="h-4 w-4" />
                {busy === "create" ? "Criando…" : "Criar conexão + QR"}
              </Button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={genQr}
                    disabled={busy !== null || status === "connected"}
                    className="gap-2"
                  >
                    <QrCode className="h-4 w-4" />
                    {busy === "qr" ? "…" : "Gerar QR"}
                  </Button>
                  <Button variant="outline" onClick={refreshStatus} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Atualizar
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={publicLink}
                  disabled={busy !== null}
                  className="gap-2"
                >
                  {busy === "link" ? <Copy className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                  Gerar link público p/ o cliente
                </Button>
                <Button
                  variant="ghost"
                  onClick={disconnect}
                  disabled={busy !== null}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Power className="h-4 w-4" />
                  Desconectar
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
