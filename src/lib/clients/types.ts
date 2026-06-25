import type { Database } from "@/integrations/supabase/types";
import type { BillingType } from "./billing-types";
import type { PaymentMethod } from "./payment-methods";
import type { Stage } from "./stages";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ClientFileRow = Database["public"]["Tables"]["client_files"]["Row"];

export type FileCategory = "contract" | "additional" | "material";

export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  stage: Stage;
  paymentMethod: PaymentMethod | null;
  contractValue: number;
  billingType: BillingType;
  installments: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientFile {
  id: string;
  clientId: string;
  fileName: string;
  filePath: string;
  bucket: string;
  fileType: string | null;
  sizeBytes: number | null;
  category: FileCategory;
  uploadedAt: string;
}

export function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.company ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    stage: row.stage as Stage,
    paymentMethod: (row.payment_method as PaymentMethod | null) ?? null,
    contractValue: Number(row.contract_value ?? 0),
    billingType: (row.billing_type as BillingType) ?? "avista",
    installments: row.installments ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapClientFile(row: ClientFileRow): ClientFile {
  return {
    id: row.id,
    clientId: row.client_id,
    fileName: row.file_name,
    filePath: row.file_path,
    bucket: row.bucket,
    fileType: row.file_type,
    sizeBytes: row.size_bytes,
    category: row.category as FileCategory,
    uploadedAt: row.uploaded_at,
  };
}
