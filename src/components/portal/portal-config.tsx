import { useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, CheckCircle2, Loader2, Lock, Palette, Save, UserRound } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Stagger, StaggerItem } from "@/components/ui/fade-in";
import { ThemeToggle } from "@/components/theme-toggle";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

interface ProfileMetadata {
  name?: string;
  avatar_url?: string;
}

// Configurações do portal do cliente: perfil (nome + foto no Supabase Auth
// user_metadata) e aparência. Sem nada de equipe/staff.
export function PortalConfig() {
  const { user } = useAuth();
  const meta = (user?.user_metadata as ProfileMetadata | undefined) ?? {};

  const [name, setName] = useState(meta.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(meta.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initial = (name || user?.email || "?").charAt(0).toUpperCase();

  const pickAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("A imagem deve ter no máximo 2MB.");
      return;
    }
    setUploading(true);
    try {
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      toast.success("Foto carregada — clique em Salvar para aplicar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar a foto.");
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({
        data: { name: name.trim(), avatar_url: avatarUrl },
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Perfil atualizado."),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar o perfil."),
  });

  const hasChanges =
    name.trim() !== (meta.name ?? "").trim() || avatarUrl !== (meta.avatar_url ?? "");
  const saving = saveMutation.isPending;

  return (
    <main className="mx-auto h-full max-w-3xl space-y-6 overflow-y-auto p-4 pb-10 md:p-6">
      <PageHeader
        title="Configurações"
        subtitle={
          hasChanges
            ? "Você tem alterações de perfil ainda não salvas"
            : `Conectado como ${user?.email ?? "sua conta"}`
        }
      />

      <Stagger className="space-y-5">
        <StaggerItem>
          <SettingsSection
            icon={<UserRound className="h-4 w-4" />}
            tone="var(--brand)"
            title="Perfil"
            description="É assim que seu nome e sua foto aparecem no portal."
            footer={
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SaveStatus saving={saving} hasChanges={hasChanges} />
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saving || uploading}
                  className="w-full sm:w-auto"
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  {saving ? "Salvando…" : "Salvar alterações"}
                </Button>
              </div>
            }
          >
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-center sm:flex-row sm:text-left">
              <Avatar className="h-20 w-20 shrink-0 ring-2 ring-border/60 ring-offset-2 ring-offset-background">
                {avatarUrl && <AvatarImage src={avatarUrl} alt="Sua foto de perfil" />}
                <AvatarFallback className="bg-primary/15 text-2xl font-semibold text-primary">
                  {initial}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {name.trim() || "Sem nome definido"}
                </p>

                <div className="flex flex-col items-center gap-1.5 sm:items-start">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="mr-1.5 h-4 w-4" />
                    )}
                    {uploading ? "Enviando…" : avatarUrl ? "Trocar foto" : "Adicionar foto"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    JPG ou PNG, até 2MB. A foto só é aplicada depois de salvar.
                  </p>
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void pickAvatar(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-name" className="text-xs font-medium">
                Nome
              </Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="profile-email" className="text-xs font-medium">
                  E-mail de acesso
                </Label>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Não editável
                </span>
              </div>
              <Input id="profile-email" value={user?.email ?? ""} readOnly disabled />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                É com este e-mail que você entra no portal. Para trocá-lo, fale com a equipe Éden.
              </p>
            </div>
          </SettingsSection>
        </StaggerItem>

        <StaggerItem>
          <SettingsSection
            icon={<Palette className="h-4 w-4" />}
            tone="var(--chart-2)"
            title="Aparência"
            description="Ajustes visuais deste dispositivo — valem só para você."
          >
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-foreground">Tema do portal</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Alterne entre claro e escuro. A escolha fica salva neste navegador.
                </p>
              </div>
              <ThemeToggle />
            </div>
          </SettingsSection>
        </StaggerItem>
      </Stagger>
    </main>
  );
}

function SettingsSection({
  icon,
  tone,
  title,
  description,
  children,
  footer,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="surface-depth surface-depth-hover overflow-hidden">
      <CardHeader className="flex-row items-start gap-3 space-y-0 border-b border-border/60 py-4">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${tone} 18%, transparent)`, color: tone }}
        >
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">{children}</CardContent>

      {footer && <div className="border-t border-border/60 bg-muted/20 px-6 py-4">{footer}</div>}
    </Card>
  );
}

function SaveStatus({ saving, hasChanges }: { saving: boolean; hasChanges: boolean }) {
  if (saving) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Enviando as alterações…
      </p>
    );
  }

  if (hasChanges) {
    return (
      <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--warning)" }}>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: "var(--warning)" }}
        />
        Alterações ainda não salvas
      </p>
    );
  }

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
      Tudo salvo
    </p>
  );
}
