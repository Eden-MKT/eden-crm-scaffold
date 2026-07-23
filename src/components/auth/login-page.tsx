import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WhatsappScene } from "./whatsapp-scene";
import { PhoneChat } from "./phone-chat";

interface LoginPageProps {
  /** "staff" (default): equipe Éden. "client": portal do cliente — muda só os textos do card. */
  variant?: "staff" | "client";
}

export function LoginPage({ variant = "staff" }: LoginPageProps) {
  const isClient = variant === "client";
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Celular centralizado no vão entre o último card de métrica e o card de
  // login, encolhendo quando o vão não comporta a largura cheia. Recalculado no
  // resize — um left/scale fixo quebra em monitores menores.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const metricsRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [phone, setPhone] = useState<{ left: number; scale: number } | null>(null);

  useLayoutEffect(() => {
    // Largura do celular (290px de tela + 10px de moldura em cada lado).
    const PHONE_W = 310;
    const MIN_GUTTER = 48; // respiro de cada lado — sem isso ele encosta nos cards
    const MIN_SCALE = 0.85; // abaixo disso não vale a pena: o layout fica apertado

    const recalc = () => {
      const root = rootRef.current;
      const metrics = metricsRef.current;
      const card = cardRef.current;
      // Só no desktop (a cena/celular ficam ocultos < md).
      if (!root || !metrics || !card || window.innerWidth < 768) {
        setPhone(null);
        return;
      }
      const rootBox = root.getBoundingClientRect();
      const metricsRight = metrics.getBoundingClientRect().right - rootBox.left;
      const cardLeft = card.getBoundingClientRect().left - rootBox.left;

      const gap = cardLeft - metricsRight;
      const usable = gap - MIN_GUTTER * 2;
      // Escala limitada pela largura do vão E pela altura da viewport (o celular
      // tem 540px + moldura; numa tela baixa ele sufoca o layout).
      const byWidth = usable / PHONE_W;
      const byHeight = (window.innerHeight - 80) / 560;
      const scale = Math.min(1, byWidth, byHeight);
      if (scale < MIN_SCALE) {
        setPhone(null); // sem espaço digno: melhor não mostrar do que atropelar o texto
        return;
      }
      setPhone({ left: (metricsRight + cardLeft) / 2, scale });
    };
    recalc();
    window.addEventListener("resize", recalc);
    // Recalcula quando fontes/layout assentam.
    const t = window.setTimeout(recalc, 300);
    return () => {
      window.removeEventListener("resize", recalc);
      clearTimeout(t);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) toast.error(error);
  };

  return (
    <div
      ref={rootRef}
      className="relative grid min-h-[100dvh] bg-background md:grid-cols-[1.1fr_0.9fr] lg:grid-cols-[1.2fr_0.8fr]"
    >
      {/* Esquerda: proposta de valor da Éden. */}
      <WhatsappScene metricsRef={metricsRef} />

      {/* Celular — posição e escala calculadas para caber no vão sem invadir
          o conteúdo. Fica oculto enquanto a medição não aconteceu. */}
      {phone && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 z-20 hidden md:block"
          style={{
            left: `${phone.left}px`,
            transform: `translate(-50%, -50%) scale(${phone.scale})`,
          }}
        >
          <PhoneChat />
        </div>
      )}

      {/* Direita: acesso da equipe — centralizado na coluna escura. */}
      <div className="relative flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div ref={cardRef} className="login-rise w-full max-w-sm">
          {/* Logo — no mobile a cena não aparece, então a marca vem aqui. */}
          <div className="mb-8 flex flex-col items-center text-center">
            <img
              src="/logo-full-transparent-1024.png"
              alt="Éden Marketing"
              className="login-float h-14 w-auto md:h-16"
            />
            <div className="mt-5 flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {isClient ? "Portal do cliente" : "Plataforma interna"}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isClient ? "Acesso do cliente." : "Acesso da equipe Éden."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="login-rise space-y-2" style={{ ["--d" as string]: "120ms" }}>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isClient ? "voce@suaempresa.com" : "voce@edenmarketing.com"}
                className="h-11 transition-shadow focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_22%,transparent)]"
              />
            </div>
            <div className="login-rise space-y-2" style={{ ["--d" as string]: "200ms" }}>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 transition-shadow focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--brand)_22%,transparent)]"
              />
            </div>
            <div className="login-rise" style={{ ["--d" as string]: "280ms" }}>
              <Button
                type="submit"
                disabled={submitting}
                className="group glow-primary h-11 w-full gap-2 text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.98]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando…
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
