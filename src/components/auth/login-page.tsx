import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { FadeIn } from "@/components/ui/fade-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const action = mode === "signin" ? signIn : signUp;
    const { error } = await action(email, password);
    setSubmitting(false);

    if (error) {
      toast.error(error);
      return;
    }
    if (mode === "signup") {
      toast.success("Conta criada! Você já pode entrar.");
      setMode("signin");
    }
  };

  return (
    <div className="app-bg relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <FadeIn className="w-full max-w-sm">
        <Card className="surface-depth glow-primary w-full overflow-hidden">
          {/* Logo completo sobre gradiente navy→royal — legível nos dois temas. */}
          <div
            className="flex items-center justify-center py-8"
            style={{
              backgroundImage: "linear-gradient(135deg, var(--navy), var(--brand))",
            }}
          >
            <img
              src="/logo-full-transparent-1024.png"
              alt="Éden Marketing"
              className="h-28 w-auto drop-shadow-lg"
            />
          </div>
          <CardHeader className="space-y-1 text-center">
            <CardTitle>Plataforma interna</CardTitle>
            <CardDescription>
              {mode === "signin" ? "Entre na sua conta." : "Crie sua conta de acesso."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@edenmarketing.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="submit"
                className="glow-primary w-full transition-all hover:brightness-110"
                disabled={submitting}
              >
                {submitting ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {mode === "signin" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
            </button>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
