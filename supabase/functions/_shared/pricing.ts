// Preços OpenAI (USD). Atualize se a OpenAI mudar a tabela.
export const MODEL_PRICING: Record<string, { inPer1M: number; outPer1M: number }> = {
  "gpt-4o-mini": { inPer1M: 0.15, outPer1M: 0.6 },
  "gpt-4o": { inPer1M: 2.5, outPer1M: 10.0 },
};

export const WHISPER_PER_MINUTE = 0.006;

// Modelos permitidos no form de configuração (evita custo arbitrário).
export const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o"];

export function chatCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = MODEL_PRICING[model] ?? MODEL_PRICING["gpt-4o-mini"];
  const cost =
    (promptTokens / 1_000_000) * p.inPer1M +
    (completionTokens / 1_000_000) * p.outPer1M;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function transcriptionCostUsd(seconds: number): number {
  const cost = (seconds / 60) * WHISPER_PER_MINUTE;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
