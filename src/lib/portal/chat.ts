import { supabase } from "@/integrations/supabase/client";
import { mapConversation, type WhatsappConversation } from "@/lib/whatsapp/types";

export interface PortalMessage {
  id: string;
  direction: "in" | "out";
  sender: "contact" | "ai" | "human";
  messageType: string;
  content: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  sentAt: string;
}

export const portalChatKeys = {
  conversations: () => ["portal", "chat", "conversations"] as const,
  messages: (id: string) => ["portal", "chat", "messages", id] as const,
};

export async function fetchPortalConversations(): Promise<WhatsappConversation[]> {
  const { data, error } = await supabase.functions.invoke("portal-chat", {
    body: { action: "list_conversations" },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data.conversations ?? []).map(mapConversation);
}

interface RawPortalMessage {
  id: string;
  direction: string;
  sender: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  media_mime: string | null;
  sent_at: string;
}

export async function fetchPortalMessages(conversationId: string): Promise<PortalMessage[]> {
  const { data, error } = await supabase.functions.invoke("portal-chat", {
    body: { action: "messages", conversationId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data.messages ?? []).map((m: RawPortalMessage) => ({
    id: m.id,
    direction: m.direction as PortalMessage["direction"],
    sender: m.sender as PortalMessage["sender"],
    messageType: m.message_type,
    content: m.content,
    mediaUrl: m.media_url ?? null,
    mediaMime: m.media_mime,
    sentAt: m.sent_at,
  }));
}
