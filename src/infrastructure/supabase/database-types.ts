// Souris — remote schema types (hand-written, V1 scope)
//
// Mirrors supabase/migrations exactly. Type aliases (not interfaces) on
// purpose: supabase-js requires the implicit index signature. Only the account-level table exists
// remotely; operational data (Clients, Appointments, Services, Products,
// Sales) is NOT synchronized in this milestone.

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
