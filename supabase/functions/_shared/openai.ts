const OPENAI = "https://api.openai.com/v1";
const key = () => Deno.env.get("OPENAI_API_KEY")!;

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
}

export interface ChatResult {
  content: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  assistant: unknown; // mensagem bruta do assistant (p/ append no histórico de tools)
  promptTokens: number;
  completionTokens: number;
}

export async function chat(opts: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  tools?: unknown[];
  maxTokens?: number;
  responseFormat?: unknown;
}): Promise<ChatResult> {
  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 700,
      tools: opts.tools,
      ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI chat ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0]?.message ?? {};
  const toolCalls = (choice.tool_calls ?? []).map(
    (tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }),
  );
  return {
    content: choice.content ?? null,
    toolCalls,
    assistant: choice,
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
}

// Transcreve áudio com whisper-1. verbose_json retorna `duration` (segundos).
export async function transcribe(
  bytes: Uint8Array,
  mime: string,
): Promise<{ text: string; seconds: number }> {
  const form = new FormData();
  const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : "ogg";
  // new Uint8Array(bytes) garante ArrayBuffer (não SharedArrayBuffer) para o Blob — type-check Deno.
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  const res = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return { text: data.text ?? "", seconds: data.duration ?? 0 };
}

// Descreve uma imagem (detail:"low" p/ custo baixo).
export async function describeImage(
  dataUrl: string,
  model = "gpt-4o-mini",
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Descreva objetivamente o conteúdo desta imagem em português, incluindo qualquer texto visível. Seja conciso.",
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Vision ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
}
