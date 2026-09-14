// Souris — remote schema types (hand-written, V1 scope)
//
// Covers the `businesses` table ONLY. Type aliases (not interfaces) on
// purpose: supabase-js requires the implicit index signature. The operational
// tables created by Cloud Sync V1A (supabase/migrations/20260914120000_…) are
// deliberately NOT typed here until the first operational adapter exists
// (V1B); the migration files are the source of truth for the remote schema
// (docs/architecture/CLOUD_SYNC.md §14.1). Nothing operational is
// synchronized yet.

export type BusinessRow = {
  id: string;
  owner_user_id: string;
  owner_first_name: string;
  owner_last_name: string | null;
  name: string;
  activity_type: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export type BusinessInsert = {
  owner_user_id: string;
  owner_first_name: string;
  owner_last_name?: string | null;
  name: string;
  activity_type: string;
  phone?: string | null;
}

export type BusinessUpdate = {
  owner_first_name?: string;
  owner_last_name?: string | null;
  name?: string;
  activity_type?: string;
  phone?: string | null;
}

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: BusinessRow;
        Insert: BusinessInsert;
        Update: BusinessUpdate;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
