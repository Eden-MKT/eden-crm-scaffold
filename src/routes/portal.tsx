import { createFileRoute, Navigate } from "@tanstack/react-router";

import { useAuth } from "@/lib/auth";
import { isStaffUser } from "@/lib/team";
import { PortalLogin } from "@/components/portal/portal-login";
import { PortalDashboard } from "@/components/portal/portal-dashboard";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [{ title: "Portal do cliente — Éden Marketing" }],
  }),
  component: PortalPage,
});

function PortalPage() {
  const { loading, session, user } = useAuth();

  if (loading) {
    return (
      <div className="app-bg flex min-h-[100dvh] items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  // Sem sessão → login do cliente.
  if (!session) return <PortalLogin />;

  // Staff não usa o portal — volta pro CRM.
  if (isStaffUser(user)) return <Navigate to="/" />;

  return <PortalDashboard />;
}
