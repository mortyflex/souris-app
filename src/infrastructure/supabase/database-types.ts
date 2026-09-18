// Souris — remote schema types (hand-written, V1 scope)
//
// Covers the `businesses` table, the two Cloud Sync V1C push functions
// (supabase/migrations/20260917120000_…) and the V1D pull function
// (supabase/migrations/20260917200000_…) — exactly what the application
// calls. Type aliases (not interfaces) on purpose: supabase-js requires the
// implicit index signature. The nine operational TABLES created by Cloud
// Sync V1A are deliberately NOT typed here: the sync adapter never touches
// them directly (every operational write goes through `sync_push_aggregate`,
// every operational read through `sync_pull_business_aggregates`, whose jsonb
// answer is validated by `parseRemoteBusinessSnapshot`, not typed here),
// and a type without a consumer would drift. The migration files are the
// source of truth for the remote schema (docs/architecture/CLOUD_SYNC.md
// §14.1).

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

/** jsonb result of `public.sync_push_aggregate`; validated at the adapter boundary. */
export type SyncPushAggregateResult = {
  status: string;
  sync_version?: number | null;
}

export type SyncPushAggregateArgs = {
  p_business_id: string;
  p_aggregate_type: string;
  p_aggregate_id: string;
  p_operation: string;
  /** NULL = this device never acknowledged the aggregate. */
  p_expected_version: number | null;
  /** NULL for a DELETE. */
  p_payload: Json | null;
}

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
    Functions: {
      sync_count_business_aggregates: {
        Args: { p_business_id: string };
        Returns: number;
      };
      sync_push_aggregate: {
        Args: SyncPushAggregateArgs;
        Returns: SyncPushAggregateResult;
      };
      sync_pull_business_aggregates: {
        /** `p_since` NULL = the complete dataset (restore, first pull). */
        Args: { p_business_id: string; p_since: string | null };
        Returns: Json;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
