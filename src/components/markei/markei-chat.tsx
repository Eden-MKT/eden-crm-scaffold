import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Bot, Inbox, MessagesSquare, PauseCircle, UserCheck } from "lucide-react";

import { fetchMarkeiMetrics, markeiKeys } from "@/lib/markei/queries";
import { fetchConversations, whatsappKeys } from "@/lib/whatsapp/queries";
import { useConversationsRealtime } from "@/lib/whatsapp/use-realtime";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { ConversationList } from "@/components/whatsapp/conversation-list";
import { MessageThread } from "@/components/whatsapp/message-thread";
import { LeadBadges } from "./lead-badges";
import { MarkeiThreadHeader } from "./markei-thread-header";
import { ConversationContextCard } from "./conversation-context-card";

const routeApi = getRouteApi("/gestao");

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// Chat & Histórico — 3 colunas: assistentes → conversas → thread.
// Reutiliza os componentes do CRM: a RLS + trigger garantem que o papel
// markei só lê e altera ai_paused/unread_count/human_takeover; envio manual
// passa pelo guard requireStaffOrMarkei na edge function.
export function MarkeiChat() {
  const search = routeApi.useSearch();
  const [agentId, setAgentId] = useState<string | null>(search.agent ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(search.conversa ?? null);

  // Deep link (ex.: "Intervir na Conversa" na tela de leads).
  useEffect(() => {
    if (search.agent) setAgentId(search.agent);
    if (search.conversa) setSelectedId(search.conversa);
  }, [search.agent, search.conversa]);

  const { data: m, isLoading: loadingAgents } = useQuery({
    queryKey: markeiKeys.metrics(),
    queryFn: () => fetchMarkeiMetrics(),
  });
  const agents = m?.porAgente ?? [];
  const activeAgentId = agentId ?? agents[0]?.agentId ?? null;
  const activeAgent = agents.find((a) => a.agentId === activeAgentId);
  const totalConversas = agents.reduce((s, a) => s + a.conversas, 0);

  const { data: conversations } = useQuery({
    queryKey: whatsappKeys.conversations(activeAgentId ?? ""),
    queryFn: () => fetchConversations(activeAgentId ?? ""),
    enabled: !!activeAgentId,
  });
  useConversationsRealtime(activeAgentId);

  // Deriva a conversa selecionada da lista (sempre fresca após invalidations).
  const selected = (conversations ?? []).find((c) => c.id === selectedId) ?? null;

  const selectAgent = (id: string) => {
    setAgentId(id);
    setSelectedId(null);
  };

  // Recortes só para leitura do cabeçalho — nada disso altera a seleção.
  const list = conversations ?? [];
  const aguardando = list.filter((c) => c.unreadCount > 0).length;
  const iaPausada = list.filter((c) => c.aiPaused).length;
  const comSecretaria = list.filter((c) => c.humanTakeover).length;

  const subtitle = (() => {
    if (agents.length === 0) {
      return loadingAgents ? "Carregando assistentes…" : "Nenhuma IA cadastrada ainda";
    }
    if (aguardando > 0) {
      return `${aguardando} ${plural(aguardando, "conversa aguardando retorno", "conversas aguardando retorno")}`;
    }
    if (list.length > 0) {
      return `${list.length} ${plural(list.length, "conversa", "conversas")} no histórico de ${activeAgent?.nome ?? "sua IA"}`;
    }
    return "Nenhuma conversa registrada para esta IA";
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* No mobile o shell já mostra o nome da view — aqui o cabeçalho seria
          repetido e comeria a altura útil do chat. */}
      <div className="hidden shrink-0 border-b border-border px-4 py-3 md:block md:px-6">
        <PageHeader
          title="Chat & Histórico"
          subtitle={subtitle}
          action={
            list.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <StatChip
                  icon={<MessagesSquare className="h-3.5 w-3.5" />}
                  label={`${list.length} ${plural(list.length, "conversa", "conversas")}`}
                  tone="var(--brand)"
                />
                {aguardando > 0 && (
                  <StatChip
                    icon={<Inbox className="h-3.5 w-3.5" />}
                    label={`${aguardando} sem resposta`}
                    tone="var(--warning)"
                  />
                )}
                {iaPausada > 0 && (
                  <StatChip
                    icon={<PauseCircle className="h-3.5 w-3.5" />}
                    label={`${iaPausada} com IA pausada`}
                    tone="var(--destructive)"
                  />
                )}
                {comSecretaria > 0 && (
                  <StatChip
                    icon={<UserCheck className="h-3.5 w-3.5" />}
                    label={`${comSecretaria} com a secretária`}
                    tone="var(--chart-2)"
                  />
                )}
              </div>
            ) : undefined
          }
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[232px_300px_1fr]">
        {/* Coluna 1: assistentes — vira topo horizontal no mobile */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border p-2 md:flex-col md:gap-1 md:overflow-y-auto md:border-b-0 md:border-r md:p-3">
          <div className="hidden md:block md:px-1 md:pb-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Assistentes
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {agents.length === 0
                ? "nenhuma ativa"
                : `${agents.length} ${plural(agents.length, "IA", "IAs")} · ${totalConversas} ${plural(totalConversas, "conversa", "conversas")}`}
            </p>
          </div>

          {loadingAgents && agents.length === 0 && (
            <div className="hidden w-full space-y-1.5 md:block">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          )}

          {!loadingAgents && agents.length === 0 && (
            <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
              Nenhuma IA cadastrada ainda. Assim que uma assistente entrar no ar, as conversas dela
              aparecem aqui.
            </p>
          )}

          {agents.map((a) => {
            const active = a.agentId === activeAgentId;
            return (
              <button
                key={a.agentId}
                type="button"
                onClick={() => selectAgent(a.agentId)}
                className={cn(
                  "relative flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-foreground md:before:absolute md:before:inset-y-2 md:before:left-0 md:before:w-0.5 md:before:rounded-full md:before:bg-primary"
                    : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
                )}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback
                    className={cn(
                      "text-[11px] font-semibold",
                      active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {a.nome.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="max-w-32 truncate font-medium text-foreground">{a.nome}</span>
                    <span
                      title={a.aiEnabled ? "IA respondendo" : "IA desligada"}
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: a.aiEnabled ? "var(--success)" : "var(--muted-foreground)",
                      }}
                    />
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {a.conversas} {plural(a.conversas, "conversa", "conversas")}
                    {a.conversasHoje > 0 ? ` · ${a.conversasHoje} hoje` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Colunas 2+3: conversas e thread (no mobile alternam) */}
        <div className={cn("flex min-h-0 flex-col", selected && "hidden md:flex")}>
          <div className="hidden shrink-0 items-center justify-between gap-2 border-b border-r border-border px-3 py-2.5 md:flex">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Conversas
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {activeAgent?.nome ?? "selecione um assistente"}
              </p>
            </div>
            {aguardando > 0 && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: "color-mix(in oklab, var(--warning) 16%, transparent)",
                  color: "var(--warning)",
                }}
              >
                {aguardando} {plural(aguardando, "nova", "novas")}
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <ConversationList
              conversations={conversations ?? []}
              selectedId={selected?.id ?? null}
              onSelect={(c) => setSelectedId(c.id)}
              itemBadges={(c) => <LeadBadges conversation={c} />}
            />
          </div>
        </div>

        <div className={cn("min-h-0", !selected && "hidden md:block")}>
          {selected && activeAgentId ? (
            <MessageThread
              conversation={selected}
              agentId={activeAgentId}
              onBack={() => setSelectedId(null)}
              headerExtras={
                <MarkeiThreadHeader
                  conversation={selected}
                  agentId={activeAgentId}
                  aiEnabled={activeAgent?.aiEnabled}
                />
              }
              aboveMessages={<ConversationContextCard conversation={selected} />}
            />
          ) : (
            <EmptyThread hasAgents={agents.length > 0} hasConversations={list.length > 0} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Cápsula tonal de leitura rápida — cor com significado, sem virar botão. */
function StatChip({ icon, label, tone }: { icon: ReactNode; label: string; tone: string }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: `color-mix(in oklab, ${tone} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${tone} 30%, transparent)`,
        color: tone,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

/**
 * Estado vazio da thread: diz o que fazer em vez de só constatar que não há
 * nada. O texto muda conforme o que falta (IA, conversa ou seleção).
 */
function EmptyThread({
  hasAgents,
  hasConversations,
}: {
  hasAgents: boolean;
  hasConversations: boolean;
}) {
  const noAgents = !hasAgents;
  const tone = noAgents ? "var(--muted-foreground)" : "var(--brand)";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: `color-mix(in oklab, ${tone} 16%, transparent)`, color: tone }}
      >
        {noAgents ? <Bot className="h-7 w-7" /> : <MessagesSquare className="h-7 w-7" />}
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {noAgents
            ? "Nenhuma IA por aqui ainda"
            : hasConversations
              ? "Escolha uma conversa"
              : "Nenhuma conversa nesta IA"}
        </p>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground">
          {noAgents
            ? "Quando uma assistente entrar no ar, todo o histórico de WhatsApp dela aparece nesta tela."
            : hasConversations
              ? "Abra uma conversa da lista para ler tudo o que o lead e a IA trocaram — e responder no lugar dela se precisar."
              : "Assim que um lead chamar no WhatsApp, a conversa aparece na lista ao lado automaticamente."}
        </p>
      </div>
    </div>
  );
}
