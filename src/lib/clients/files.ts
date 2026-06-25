import { supabase } from "@/integrations/supabase/client";

import { mapClientFile, type ClientFile, type FileCategory } from "./types";

export const CONTRACTS_BUCKET = "contracts";
export const MATERIALS_BUCKET = "client-materials";

export function bucketForCategory(category: FileCategory): string {
  return category === "contract" ? CONTRACTS_BUCKET : MATERIALS_BUCKET;
}

export const clientFilesKey = (clientId: string) => ["clients", "files", clientId] as const;

export async function listClientFiles(clientId: string): Promise<ClientFile[]> {
  const { data, error } = await supabase
    .from("client_files")
    .select("*")
    .eq("client_id", clientId)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapClientFile);
}

// Remove acentos/espaços para um nome de objeto seguro no Storage.
function sanitize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento combinantes
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

export interface UploadInput {
  clientId: string;
  file: File;
  category: FileCategory;
}

export async function uploadClientFile({
  clientId,
  file,
  category,
}: UploadInput): Promise<ClientFile> {
  const bucket = bucketForCategory(category);
  const path = `${clientId}/${category}/${Date.now()}-${sanitize(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("client_files")
    .insert({
      client_id: clientId,
      file_name: file.name,
      file_path: path,
      bucket,
      file_type: file.type || null,
      size_bytes: file.size,
      category,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapClientFile(data);
}

/** URL assinada temporária para visualizar/baixar um arquivo privado. */
export async function getClientFileUrl(file: ClientFile): Promise<string> {
  const { data, error } = await supabase.storage
    .from(file.bucket)
    .createSignedUrl(file.filePath, 60 * 60); // 1h
  if (error) throw error;
  return data.signedUrl;
}

export async function removeClientFile(file: ClientFile): Promise<void> {
  const { error: storageError } = await supabase.storage.from(file.bucket).remove([file.filePath]);
  if (storageError) throw storageError;

  const { error } = await supabase.from("client_files").delete().eq("id", file.id);
  if (error) throw error;
}
