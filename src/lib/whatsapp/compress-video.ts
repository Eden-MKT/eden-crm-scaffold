/**
 * Comprime vídeo no browser (ffmpeg.wasm) para caber no limite do WhatsApp (~16MB).
 * Carrega o core sob demanda — não entra no bundle inicial.
 */

export const WHATSAPP_VIDEO_MAX_BYTES = 16 * 1024 * 1024;
/** Aceita arquivo grande só como entrada da compressão (não sobe o original). */
export const SOURCE_VIDEO_MAX_BYTES = 1024 * 1024 * 1024; // 1GB

export type CompressProgress = {
  phase: "loading" | "compressing";
  /** 0–1 durante compressing; loading fica em 0 */
  ratio: number;
};

function mb(n: number): string {
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Se já está ≤16MB e é mp4/3gp, devolve o próprio arquivo.
 * Caso contrário reencode MP4 H.264/AAC, tentando CRF crescente se ainda passar do teto.
 */
export async function compressVideoForWhatsApp(
  file: File,
  onProgress?: (p: CompressProgress) => void,
): Promise<File> {
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|3gp)$/i.test(file.name)) {
    throw new Error("Envie um arquivo de vídeo (mp4, webm ou mov).");
  }
  if (file.size > SOURCE_VIDEO_MAX_BYTES) {
    throw new Error(`Vídeo muito grande para processar aqui (máx. ${mb(SOURCE_VIDEO_MAX_BYTES)}).`);
  }

  const alreadyOk =
    file.size <= WHATSAPP_VIDEO_MAX_BYTES &&
    (file.type === "video/mp4" || file.type === "video/3gpp" || /\.mp4$/i.test(file.name));
  if (alreadyOk) return file;

  onProgress?.({ phase: "loading", ratio: 0 });

  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.({ phase: "compressing", ratio: Math.min(0.99, Math.max(0, progress)) });
  });

  // Core single-thread (não exige Cross-Origin-Isolation / SharedArrayBuffer).
  const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  const inputName = "input" + extOf(file.name);
  const outputName = "output.mp4";
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // Tentativas: qualidade decrescente até caber em 16MB.
  const attempts: { crf: string; scale: string; audio: string }[] = [
    { crf: "28", scale: "min(1280\\,iw)", audio: "96k" },
    { crf: "32", scale: "min(960\\,iw)", audio: "64k" },
    { crf: "36", scale: "min(720\\,iw)", audio: "48k" },
  ];

  let lastSize = 0;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    onProgress?.({ phase: "compressing", ratio: i / attempts.length });
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ok se não existir */
    }

    const code = await ffmpeg.exec([
      "-i",
      inputName,
      "-vf",
      `scale=${a.scale}:-2`,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      a.crf,
      "-c:a",
      "aac",
      "-b:a",
      a.audio,
      "-movflags",
      "+faststart",
      "-y",
      outputName,
    ]);
    if (code !== 0) continue;

    const data = await ffmpeg.readFile(outputName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    lastSize = bytes.byteLength;
    if (lastSize <= WHATSAPP_VIDEO_MAX_BYTES) {
      onProgress?.({ phase: "compressing", ratio: 1 });
      const copy = new Uint8Array(bytes);
      const blob = new Blob([copy], { type: "video/mp4" });
      const base = file.name.replace(/\.[^.]+$/, "") || "objecao";
      return new File([blob], `${base}-whatsapp.mp4`, { type: "video/mp4" });
    }
  }

  throw new Error(
    `Não deu para comprimir até ${mb(WHATSAPP_VIDEO_MAX_BYTES)} (ficou ~${mb(lastSize)}). ` +
      "Comprima no HandBrake para até 16MB ou cole a URL de um vídeo já leve.",
  );
}

function extOf(name: string): string {
  const m = name.match(/\.[a-z0-9]+$/i);
  return m ? m[0].toLowerCase() : ".mp4";
}
