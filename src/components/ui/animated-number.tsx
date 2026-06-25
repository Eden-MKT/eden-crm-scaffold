import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

interface AnimatedNumberProps {
  value: number;
  /** Formata o número para exibição (ex.: moeda). Default: inteiro pt-BR. */
  format?: (n: number) => string;
  /** Duração da contagem em ms. */
  duration?: number;
  className?: string;
}

const defaultFormat = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));

/**
 * Contador animado. No SSR/primeiro paint mostra o valor FINAL já formatado
 * (sem flash de 0, sem hydration mismatch); a contagem sobe só após montar,
 * e é ignorada quando o usuário prefere menos movimento.
 */
export function AnimatedNumber({
  value,
  format = defaultFormat,
  duration = 700,
  className,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const frame = useRef<number>(0);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration, reduce]);

  return <span className={className}>{format(display)}</span>;
}
