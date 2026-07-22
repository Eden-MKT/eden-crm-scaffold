import { useEffect, useRef, useState } from "react";
import { CheckCheck } from "lucide-react";

/**
 * Celular estilizado com um fluxo CONTÍNUO de conversas de WhatsApp onde a IA
 * atende, qualifica e agenda. Vive centralizado na divisa das colunas do login.
 *
 * Stream por JS: pool de conversas variadas toca em sequência (mensagem a
 * mensagem, com "digitando" antes das respostas da IA); nunca a mesma repetida
 * em seguida. Rola sozinho. Respeita prefers-reduced-motion.
 */

type Turn = { from: "lead" | "ia"; text: string };

// Conversas curtas e realistas — sem nome próprio de cliente, sem emojis.
const CONVERSATIONS: { turns: Turn[] }[] = [
  {
    turns: [
      { from: "lead", text: "Oi, queria marcar uma avaliação" },
      { from: "ia", text: "Claro! A primeira avaliação é de cortesia. Prefere manhã ou tarde?" },
      { from: "lead", text: "De manhã fica melhor pra mim" },
      { from: "ia", text: "Tenho quinta às 9h ou sexta às 10h. Qual encaixa melhor?" },
      { from: "lead", text: "Pode ser quinta às 9h" },
      { from: "ia", text: "Agendado, quinta às 9h. Envio um lembrete na véspera. Até lá!" },
    ],
  },
  {
    turns: [
      { from: "lead", text: "Qual o valor do implante?" },
      {
        from: "ia",
        text: "Depende da avaliação, mas parcelamos em até 24x. Quer agendar uma avaliação sem compromisso?",
      },
      { from: "lead", text: "Quero sim" },
      { from: "ia", text: "Perfeito. Terça às 14h está livre. Confirmo pra você?" },
      { from: "lead", text: "Confirma" },
      { from: "ia", text: "Prontinho, terça às 14h. Qualquer coisa é só chamar aqui." },
    ],
  },
  {
    turns: [
      { from: "lead", text: "Preciso remarcar minha consulta de amanhã" },
      { from: "ia", text: "Sem problema. Tenho quinta às 11h ou sexta às 15h. Qual prefere?" },
      { from: "lead", text: "Sexta às 15h" },
      { from: "ia", text: "Remarcado para sexta às 15h. O horário de amanhã foi liberado." },
    ],
  },
  {
    turns: [
      { from: "lead", text: "Vocês atendem aos sábados?" },
      {
        from: "ia",
        text: "Atendemos de segunda a sexta, das 8h às 18h. Consigo um horário nessa semana pra você.",
      },
      { from: "lead", text: "Pode ser sexta de tarde" },
      { from: "ia", text: "Fechado, sexta às 16h. Te espero por aqui!" },
    ],
  },
];

type StreamItem =
  | { id: number; kind: "msg"; from: "lead" | "ia"; text: string; time: string }
  | { id: number; kind: "typing" };

function clock(base: number): string {
  const total = 9 * 60 + 41 + base;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const REDUCED =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function PhoneChat({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [items, setItems] = useState<StreamItem[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    if (REDUCED) {
      setItems(
        CONVERSATIONS[0].turns.map((t, i) => ({
          id: i,
          kind: "msg" as const,
          from: t.from,
          text: t.text,
          time: clock(i),
        })),
      );
      return;
    }

    let alive = true;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));

    let order: number[] = [];
    let last = -1;
    const nextConvo = () => {
      if (order.length === 0) {
        order = CONVERSATIONS.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        if (order[0] === last && order.length > 1) [order[0], order[1]] = [order[1], order[0]];
      }
      last = order.shift() as number;
      return CONVERSATIONS[last];
    };

    const push = (
      item: { kind: "typing" } | { kind: "msg"; from: "lead" | "ia"; text: string; time: string },
    ) => {
      const id = idRef.current++;
      setItems((prev) => {
        const next = [...prev, { ...item, id } as StreamItem];
        return next.length > 9 ? next.slice(next.length - 9) : next;
      });
      return id;
    };

    const removeById = (id: number) => setItems((prev) => prev.filter((it) => it.id !== id));

    async function run() {
      let tick = 0;
      while (alive) {
        const convo = nextConvo();
        for (let i = 0; i < convo.turns.length && alive; i++) {
          const turn = convo.turns[i];
          if (turn.from === "ia") {
            const typingId = push({ kind: "typing" });
            await wait(900 + Math.min(turn.text.length * 22, 1400));
            if (!alive) return;
            removeById(typingId);
          } else {
            await wait(700);
          }
          if (!alive) return;
          push({ kind: "msg", from: turn.from, text: turn.text, time: clock(tick++) });
          await wait(turn.from === "ia" ? 1200 : 600);
        }
        await wait(1800);
      }
    }

    run();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: REDUCED ? "auto" : "smooth" });
  }, [items]);

  return (
    <div className={className} style={style} aria-hidden="true">
      {/* Moldura do celular: bordas grossas escuras, cantos bem arredondados. */}
      <div className="relative h-[540px] w-[290px] rounded-[2.6rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl ring-1 ring-white/10">
        {/* Notch / ilha superior */}
        <div className="absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-neutral-900" />
        {/* Tela */}
        <div
          className="relative flex h-full w-full flex-col overflow-hidden rounded-[1.9rem]"
          style={{
            backgroundImage:
              "linear-gradient(170deg, var(--navy) 0%, color-mix(in oklab, var(--navy) 45%, black) 60%)",
          }}
        >
          {/* Barra do "contato" (topo do WhatsApp) */}
          <div
            className="flex items-center gap-2.5 px-4 pb-3 pt-6"
            style={{
              backgroundImage: "linear-gradient(180deg, var(--brand) 0%, var(--navy) 100%)",
            }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z" />
              </svg>
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Atendimento</p>
              <p className="text-[10px] text-white/70">online agora</p>
            </div>
            <span className="ml-auto flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-light)]" />
              IA
            </span>
          </div>

          {/* Stream de bolhas */}
          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 py-3"
          >
            {items.map((it) =>
              it.kind === "typing" ? (
                <div
                  key={it.id}
                  className="bubble-in flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-white/90 px-3 py-2.5 shadow-sm"
                >
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-500" />
                  <span
                    className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-500"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <span
                    className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-500"
                    style={{ animationDelay: "0.3s" }}
                  />
                </div>
              ) : (
                <div
                  key={it.id}
                  className={
                    it.from === "ia"
                      ? "bubble-in ml-auto max-w-[94%]"
                      : "bubble-in mr-auto max-w-[94%]"
                  }
                >
                  <div
                    className={
                      it.from === "ia"
                        ? "rounded-2xl rounded-br-md bg-[var(--brand)] px-3 py-1.5 text-[13px] leading-snug text-white shadow-sm"
                        : "rounded-2xl rounded-bl-md bg-white px-3 py-1.5 text-[13px] leading-snug text-neutral-800 shadow-sm"
                    }
                  >
                    {it.text}
                    <span
                      className={
                        it.from === "ia"
                          ? "mt-0.5 flex items-center justify-end gap-1 text-[9px] text-white/70"
                          : "mt-0.5 flex items-center justify-end gap-1 text-[9px] text-neutral-400"
                      }
                    >
                      {it.time}
                      {it.from === "ia" && <CheckCheck className="h-2.5 w-2.5" />}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
