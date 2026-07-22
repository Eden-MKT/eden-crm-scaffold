import { createFileRoute, Navigate } from "@tanstack/react-router";

import { useAuth } from "@/lib/auth";
import { isStaffUser } from "@/lib/team";
import { MarkeiHome, MARKEI_VIEWS, type MarkeiView } from "@/components/markei/markei-home";

interface GestaoSearch {
  // Opcional para que links de outras rotas (<Link to="/gestao">) não exijam
  // search — o default "dashboard" é aplicado no MarkeiHome.
  view?: MarkeiView;
  agent?: string;
  conversa?: string;
}

export const Route = createFileRoute("/gestao")({
  validateSearch: (search: Record<string, unknown>): GestaoSearch => ({
    view: MARKEI_VIEWS.includes(search.view as MarkeiView)
      ? (search.view as MarkeiView)
      : undefined,
    agent: typeof search.agent === "string" ? search.agent : undefined,
    conversa: typeof search.conversa === "string" ? search.conversa : undefined,
  }),
  head: () => ({
    meta: [{ title: "Gestão — Éden Marketing CRM" }],
  }),
  component: GestaoPage,
});

// O painel tem shell próprio (sidebar/tab bar) e renderiza FORA do AppShell —
// o __root.tsx trata /gestao como /portal e /conectar. Por isso o guard de
// sessão + staff vive aqui.
function GestaoPage() {
  const { loading, session, user } = useAuth();

  if (loading) {
    return (
      <div className="app-bg flex min-h-[100dvh] items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  // Sem sessão ou não-staff → volta pra raiz (login ou portal, conforme o caso).
  if (!session || !isStaffUser(user)) return <Navigate to="/" />;

  return <MarkeiHome />;
}
