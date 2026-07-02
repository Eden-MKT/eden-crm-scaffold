// Tipos do schema do Supabase (compatível com os generics do supabase-js).
// Mantido à mão; pode ser regenerado com:
//   supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          name: string;
          company: string | null;
          email: string | null;
          phone: string | null;
          stage: string;
          payment_method: string | null;
          contract_value: number;
          billing_type: string;
          installments: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          stage?: string;
          payment_method?: string | null;
          contract_value?: number;
          billing_type?: string;
          installments?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          stage?: string;
          payment_method?: string | null;
          contract_value?: number;
          billing_type?: string;
          installments?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      finance_entries: {
        Row: {
          id: string;
          kind: string;
          client_id: string | null;
          description: string;
          amount: number;
          category: string;
          billing_type: string | null;
          due_date: string | null;
          status: string;
          paid_at: string | null;
          installment_no: number | null;
          installment_total: number | null;
          is_recurring: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind: string;
          client_id?: string | null;
          description: string;
          amount?: number;
          category: string;
          billing_type?: string | null;
          due_date?: string | null;
          status?: string;
          paid_at?: string | null;
          installment_no?: number | null;
          installment_total?: number | null;
          is_recurring?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kind?: string;
          client_id?: string | null;
          description?: string;
          amount?: number;
          category?: string;
          billing_type?: string | null;
          due_date?: string | null;
          status?: string;
          paid_at?: string | null;
          installment_no?: number | null;
          installment_total?: number | null;
          is_recurring?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finance_entries_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_task_completions: {
        Row: {
          id: string;
          client_id: string;
          task_key: string;
          completed_at: string;
          completed_by: string | null;
        };
        Insert: {
          id?: string;
          client_id: string;
          task_key: string;
          completed_at?: string;
          completed_by?: string | null;
        };
        Update: {
          id?: string;
          client_id?: string;
          task_key?: string;
          completed_at?: string;
          completed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_task_completions_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_credentials: {
        Row: {
          client_id: string;
          instagram_login: string | null;
          instagram_password: string | null;
          notes: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          client_id: string;
          instagram_login?: string | null;
          instagram_password?: string | null;
          notes?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          client_id?: string;
          instagram_login?: string | null;
          instagram_password?: string | null;
          notes?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_credentials_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_files: {
        Row: {
          id: string;
          client_id: string;
          file_name: string;
          file_path: string;
          bucket: string;
          file_type: string | null;
          size_bytes: number | null;
          category: string;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          file_name: string;
          file_path: string;
          bucket: string;
          file_type?: string | null;
          size_bytes?: number | null;
          category?: string;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          file_name?: string;
          file_path?: string;
          bucket?: string;
          file_type?: string | null;
          size_bytes?: number | null;
          category?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_files_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
