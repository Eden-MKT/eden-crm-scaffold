import { createFileRoute } from "@tanstack/react-router";

import { FadeIn } from "@/components/ui/fade-in";
import { AgendaView } from "@/components/agenda/agenda-view";

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda — Éden Marketing CRM" },
      { name: "description", content: "Agenda interna da equipe Éden Marketing." },
    ],
  }),
  component: AgendaPage,
});

function AgendaPage() {
  return (
    <FadeIn>
      <AgendaView />
    </FadeIn>
  );
}
