import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Link2, Power, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { evolutionManager } from "@/lib/whatsapp/manager";
import { whatsappKeys } from "@/lib/whatsapp/queries";
import type { WhatsappAgent } from "@/lib/whatsapp/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// O QR da Evolution expira/rotaciona a cada ~40s — por isso, enquanto houver
// QR na tela, ele é renovado automaticamente a cada 30s (senão o celular
// recusa com "não foi possível conectar").
const QR_REFRESH_MS = 30000;

export function ConnectionPanel({ agent, clientName, open, onOpenChange }: ConnectionPanelProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(agent.status);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairPhone, setPairPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const hasInstance = Boolean(agent.instanceName);

  const refreshStatus = async () => {
    try {
      const r = await evolutionManager.status(agent.id);
      setStatus(r.status as typeof status);
      if (r.status === "connected") {
        setQr(null);
        setPairingCode(null);
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

  // Auto-renovação do QR exibido (antes de expirar).
  useEffect(() => {
    if (!open || !qr || status === "connected") return;
    const id = setInterval(async () => {
      try {
        const r = await evolutionManager.qr(agent.id);
        if (r.base64) setQr(r.base64);
      } catch {
        /* mantém o QR atual; o próximo tick tenta de novo */
      }
    }, QR_REFRESH_MS);
    return () => clearInterval(id);
  }, [open, qr, status, agent.id]);

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
      setPairingCode(null);
      setStatus("connecting");
    });

  const genQr = () =>
    run("qr", async () => {
      const r = await evolutionManager.qr(agent.id);
      setQr(r.base64);
      setPairingCode(null);
    });

  const genPairingCode = () =>
    run("pair", async () => {
      const digits = pairPhone.replace(/\D/g, "");
      if (digits.length < 10) {
        toast.error("Informe o número com DDI, ex.: 5534999990000");
        return;
      }
      const r = await evolutionManager.qr(agent.id, digits);
      if (r.pairingCode) {
        setPairingCode(r.pairingCode);
        setQr(null);
      } else {
        toast.error("A Evolution não retornou código de pareamento. Tente pelo QR.");
      }
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
      setPairingCode(null);
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
                Abra o WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie.
                <br />O código é renovado automaticamente a cada 30s — escaneie o que estiver na
                tela.
              </p>
            </div>
          )}

          {pairingCode && status !== "connected" && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
              <p className="font-mono text-2xl font-semibold tracking-[0.3em]">{pairingCode}</p>
              <p className="text-center text-xs text-muted-foreground">
                No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho →{" "}
                <b>Conectar com número de telefone</b> e digite o código acima.
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

                {status !== "connected" && (
                  <div className="flex gap-2">
                    <Input
                      value={pairPhone}
                      onChange={(e) => setPairPhone(e.target.value)}
                      placeholder="Nº do aparelho c/ DDI (5534…)"
                      className="text-sm"
                    />
                    <Button
                      variant="outline"
                      onClick={genPairingCode}
                      disabled={busy !== null}
                      className="shrink-0 gap-2"
                      title="Conectar digitando um código no celular (alternativa ao QR)"
                    >
                      <KeyRound className="h-4 w-4" />
                      {busy === "pair" ? "…" : "Código"}
                    </Button>
                  </div>
                )}

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
