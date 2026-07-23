import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/conectar/$token")({
  head: () => ({
    meta: [{ title: "Conectar WhatsApp — Éden Marketing" }],
  }),
  component: ConnectPage,
});

type Status = "loading" | "connecting" | "connected" | "expired" | "error" | "blocked" | "waiting";

function ConnectPage() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (stopped.current) return;
      try {
        const { data, error } = await supabase.functions.invoke("whatsapp-connect", {
          body: { token },
        });
        if (error) throw error;
        if (data.status === "connected") {
          setStatus("connected");
          stopped.current = true;
          return;
        }
        if (data.status === "expired") {
          setStatus("expired");
          stopped.current = true;
          return;
        }
        if (data.status === "blocked") {
          setMessage(data.message ?? null);
          setStatus("blocked");
          stopped.current = true;
          return;
        }
        if (data.qrBase64) {
          setQr(data.qrBase64);
          setStatus("connecting");
        } else if (data.status === "disconnected") {
          // Instância ainda não preparada pelo time → aguarda (não trava em "Gerando…").
          setStatus("waiting");
        }
      } catch {
        setStatus("error");
      }
      if (!stopped.current) timer = setTimeout(poll, 4000);
    };
    poll();
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [token]);

  const qrSrc = qr ? `data:image/png;base64,${qr.replace(/^data:image\/\w+;base64,/, "")}` : null;

  return (
    <div className="app-bg flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-card)]">
        <div
          className="flex items-center justify-center py-8"
          style={{
            backgroundImage: "linear-gradient(135deg, var(--navy), var(--brand))",
          }}
        >
          <img
            src="/logo-full-transparent-1024.png"
            alt="Éden Marketing"
            className="h-24 w-auto drop-shadow-lg"
          />
        </div>

        <div className="space-y-4 bg-card p-6 text-center">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Conectar seu WhatsApp</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Abra o WhatsApp no celular → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>{" "}
              e escaneie o código.
            </p>
          </div>

          <div className="flex min-h-[16rem] items-center justify-center">
            {status === "connected" ? (
              <div className="space-y-2">
                <div className="text-4xl">✅</div>
                <p className="font-medium text-foreground">Conectado!</p>
                <p className="text-sm text-muted-foreground">
                  Pode fechar esta página. Sua IA já está ativa.
                </p>
              </div>
            ) : status === "expired" ? (
              <p className="text-sm text-destructive">
                Este link expirou. Peça um novo link à equipe.
              </p>
            ) : status === "blocked" ? (
              <div className="space-y-2">
                <div className="text-4xl">🚫</div>
                <p className="font-medium text-destructive">Não foi possível conectar</p>
                <p className="text-sm text-muted-foreground">
                  {message ?? "Este número parece estar bloqueado/banido pelo WhatsApp."} Fale com a
                  equipe para usar outro número.
                </p>
              </div>
            ) : status === "error" ? (
              <p className="text-sm text-destructive">
                Não foi possível carregar. Tentando novamente…
              </p>
            ) : status === "waiting" ? (
              <p className="text-sm text-muted-foreground">
                Preparando sua conexão… Assim que estiver pronta, o código aparece aqui.
              </p>
            ) : qrSrc ? (
              <img src={qrSrc} alt="QR code" className="h-60 w-60 rounded-lg bg-white p-2" />
            ) : (
              <p className="text-sm text-muted-foreground">Gerando código…</p>
            )}
          </div>

          {status === "connecting" && (
            <p className="text-xs text-muted-foreground">
              O código atualiza automaticamente. Mantenha esta página aberta.
            </p>
          )}
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Éden Marketing — conexão segura</p>
    </div>
  );
}
