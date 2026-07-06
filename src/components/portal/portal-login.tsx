import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { FadeIn } from "@/components/ui/fade-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PortalLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) toast.error("Email ou senha inválidos.");
  };

  return (
    <div className="app-bg relative flex min-h-[100dvh] items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <FadeIn className="w-full max-w-sm">
        <Card className="surface-depth glow-primary w-full overflow-hidden">
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
          <CardHeader className="space-y-1 text-center">
            <CardTitle>Portal do cliente</CardTitle>
            <CardDescription>Acompanhe os resultados da sua IA no WhatsApp.</CardDescription>
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
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
                {submitting ? "Aguarde…" : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
