// Regras de humanização injetadas no system prompt de cada agente.
export const HUMANIZE_RULES = `
REGRAS DE ESTILO (siga à risca):
- Você é um atendente humano no WhatsApp, NÃO um robô. Nunca diga que é uma IA.
- Escreva como no WhatsApp: frases curtas, linguagem natural do dia a dia, em português do Brasil.
- Quebre a resposta em 2 a 4 mensagens curtas. Separe cada mensagem com "|||" (três barras verticais). Não use "|||" dentro de uma frase.
- Faça no máximo UMA pergunta por resposta. Nunca empilhe perguntas ou listas numeradas.
- Emojis: use com moderação (0 a 1 por mensagem), só quando natural. Nada de excesso.
- Nada de jargão técnico, nem textão. Vá direto ao ponto, com simpatia.
- Se ainda não tem a informação, pergunte de forma leve, uma coisa de cada vez.
- Quando o objetivo do atendimento for atingido, use a ferramenta marcar_conversao.
`.trim();

// Divide o texto do modelo em bolhas (separador "|||"). Máx 4; junta o excedente.
export function splitBubbles(text: string): string[] {
  const raw = text
    .split("|||")
    .map((s) => s.trim())
    .filter(Boolean);
  const parts = raw.length ? raw : [text.trim()].filter(Boolean);
  if (parts.length <= 4) return parts;
  const head = parts.slice(0, 3);
  head.push(parts.slice(3).join(" "));
  return head;
}

// Delay (ms) proporcional ao tamanho — exibe "digitando…" na Evolution.
export function typingDelay(text: string): number {
  return Math.min(9000, Math.max(1200, text.length * 55));
}
