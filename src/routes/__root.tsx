import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  Navigate,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppToaster } from "@/components/layout/app-toaster";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isStaffUser } from "@/lib/team";
import { LoginPage } from "@/components/auth/login-page";
import { UserMenu } from "@/components/auth/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { FadeIn } from "@/components/ui/fade-in";

// Evita "flash" de tema errado no SSR: aplica a classe antes da página pintar.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('eden-theme')||'dark';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Éden Marketing CRM" },
      { name: "description", content: "Plataforma interna da Éden Marketing." },
      { name: "author", content: "Éden Marketing" },
      { property: "og:title", content: "Éden Marketing CRM" },
      {
        property: "og:description",
        content: "Plataforma interna da Éden Marketing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Éden Marketing CRM" },
      { property: "og:description", content: "Plataforma interna da Éden Marketing." },
      { name: "twitter:description", content: "Plataforma interna da Éden Marketing." },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/8JNABpLnp7Mx4rKPqtRXqYncb2k2/social-images/social-1782427286660-logo-full-transparent-1024.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/8JNABpLnp7Mx4rKPqtRXqYncb2k2/social-images/social-1782427286660-logo-full-transparent-1024.webp",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon-64x64.png" },
      { rel: "apple-touch-icon", href: "/favicon-64x64.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <AuthProvider>
            <AuthGate />
            <AppToaster />
          </AuthProvider>
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Controla o acesso: carrega sessão → login → shell (CRM staff) ou portal (cliente).
function AuthGate() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { loading, session, user } = useAuth();

  // Rotas com shell próprio (QR público, portal do cliente) renderizam fora do
  // AppShell. Checado antes de loading/login (SSR-safe via router).
  if (pathname.startsWith("/conectar") || pathname.startsWith("/portal")) {
    return <Outlet />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  // Cliente-portal logado que caiu numa rota interna → manda pro portal dele.
  if (!isStaffUser(user)) {
    return <Navigate to="/portal" />;
  }

  return <AppShell />;
}

function AppShell() {
  return (
    /* Layout principal do CRM: sidebar + área de conteúdo. */
    <SidebarProvider>
      <div className="app-bg flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border/80 bg-background/85 px-3 shadow-[var(--shadow-soft)] backdrop-blur-sm md:h-14 md:px-4">
            <SidebarTrigger className="hidden md:inline-flex" />
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <img
                src="/favicon-64x64.png"
                alt=""
                className="h-7 w-7 shrink-0 rounded-md"
                aria-hidden
              />
              <span className="truncate text-sm font-semibold">Éden CRM</span>
            </div>
            <span className="hidden text-sm font-medium text-muted-foreground md:inline">
              Éden Marketing CRM
            </span>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 p-4 pb-main-mobile md:p-6">
            {/* Required: nested routes render here. */}
            <FadeIn>
              <Outlet />
            </FadeIn>
          </main>
        </div>
        <MobileTabBar />
      </div>
    </SidebarProvider>
  );
}
