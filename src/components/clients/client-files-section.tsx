import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  clientFilesKey,
  getClientFileUrl,
  listClientFiles,
  removeClientFile,
  uploadClientFile,
} from "@/lib/clients/files";
import type { ClientFile, FileCategory } from "@/lib/clients/types";
import { formatDate, formatFileSize } from "@/lib/format";
import { Button } from "@/components/ui/button";

const CATEGORY_LABEL: Record<FileCategory, string> = {
  contract: "Contrato",
  additional: "Adicional",
  material: "Material",
};

interface ClientFilesSectionProps {
  clientId: string;
  /** Categoria atribuída aos novos uploads. */
  uploadCategory: FileCategory;
}

export function ClientFilesSection({ clientId, uploadCategory }: ClientFilesSectionProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: files, isLoading } = useQuery({
    queryKey: clientFilesKey(clientId),
    queryFn: () => listClientFiles(clientId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: clientFilesKey(clientId) });

  const uploadMutation = useMutation({
    mutationFn: async (fileList: File[]) => {
      for (const file of fileList) {
        await uploadClientFile({ clientId, file, category: uploadCategory });
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Arquivo(s) enviado(s).");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha no upload."),
  });

  const removeMutation = useMutation({
    mutationFn: (file: ClientFile) => removeClientFile(file),
    onSuccess: () => {
      invalidate();
      toast.success("Arquivo removido.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao remover."),
  });

  const handleDownload = async (file: ClientFile) => {
    try {
      const url = await getClientFileUrl(file);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Não foi possível abrir o arquivo.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Materiais e documentos</h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={uploadMutation.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {uploadMutation.isPending ? "Enviando…" : "Enviar"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            if (list.length) uploadMutation.mutate(list);
            e.target.value = "";
          }}
        />
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando arquivos…</p>}

      {!isLoading && (files?.length ?? 0) === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Nenhum arquivo enviado ainda.
        </p>
      )}

      <ul className="space-y-2">
        {files?.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 p-2"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{file.fileName}</p>
              <p className="text-[11px] text-muted-foreground">
                {CATEGORY_LABEL[file.category]} · {formatFileSize(file.sizeBytes)} ·{" "}
                {formatDate(file.uploadedAt)}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => void handleDownload(file)}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate(file)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
