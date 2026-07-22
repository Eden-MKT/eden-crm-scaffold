import type { RefObject } from "react";
import { Check } from "lucide-react";

/**
 * Coluna esquerda do login: proposta de valor da Éden (headline, métricas e
 * benefícios). O celular com a conversa animada é sobreposto por fora
 * (PhoneChat), centralizado entre o último card de métrica e o card de login.
 *
 * metricsRef → grid de métricas; sua borda direita ancora essa centralização.
 */
export function WhatsappScene({ metricsRef }: { metricsRef?: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      className="relative hidden overflow-hidden md:flex md:flex-col md:justify-center"
      style={{ backgroundImage: "linear-gradient(150deg, var(--navy) 0%, var(--brand) 160%)" }}
    >
      {/* brilho ambiente que pulsa */}
      <div
        className="scene-glow pointer-events-none absolute -left-24 top-1/4 h-96 w-96 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand-light), transparent 70%)" }}
      />
      {/* trama de pontos sutil (textura) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          color: "var(--brand-light)",
        }}
      />

      {/* Conteúdo — largura generosa para o texto respirar (o headline não deve
          quebrar em 5 linhas). */}
      <div className="relative z-10 max-w-2xl px-10 lg:px-14">
        <p className="stat-rise text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
          Éden Marketing · IA de atendimento
        </p>
        <h1
          className="stat-rise mt-3 text-balance text-3xl font-bold leading-tight text-white lg:text-4xl"
          style={{ ["--d" as string]: "80ms" }}
        >
          Sua IA atende, qualifica e agenda.
          <br />
          <span className="text-white/80">Você cuida do resto.</span>
        </h1>

        {/* Métricas — a borda direita deste grid ancora a centralização do celular. */}
        <div ref={metricsRef} className="mt-8 grid max-w-lg grid-cols-3 gap-4">
          {[
            { k: "24/7", v: "sempre ativa" },
            { k: "~15s", v: "pra responder" },
            { k: "+38%", v: "de conversão" },
          ].map((m, i) => (
            <div
              key={m.k}
              className="stat-rise rounded-xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-sm"
              style={{ ["--d" as string]: `${160 + i * 80}ms` }}
            >
              <p className="text-xl font-bold text-white tabular-nums">{m.k}</p>
              <p className="text-[11px] leading-tight text-white/60">{m.v}</p>
            </div>
          ))}
        </div>

        {/* Benefícios de usar a plataforma */}
        <ul className="mt-8 space-y-3.5">
          {[
            {
              t: "Atende na hora, dia e noite",
              d: "Nenhum lead fica sem resposta — nem de madrugada, nem no fim de semana.",
            },
            {
              t: "Agenda e confirma sozinha",
              d: "Marca a consulta, evita conflitos de horário e lembra o paciente na véspera.",
            },
            {
              t: "Qualifica e prioriza",
              d: "Entende o interesse do lead e encaminha os quentes para a sua equipe.",
            },
            {
              t: "Tudo no seu CRM",
              d: "Cada conversa vira um lead no CRM, movido de etapa automaticamente.",
            },
          ].map((b, i) => (
            <li
              key={b.t}
              className="stat-rise flex gap-3"
              style={{ ["--d" as string]: `${380 + i * 90}ms` }}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-light)]/20">
                <Check className="h-3 w-3 text-[var(--brand-light)]" />
              </span>
              <div className="max-w-md leading-snug">
                <p className="text-sm font-semibold text-white">{b.t}</p>
                <p className="text-xs text-white/60">{b.d}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
