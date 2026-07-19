/**
 * Hand-written to exactly match supabase/migrations/*.sql for the
 * Foundation milestone. This file is a stand-in for the output of:
 *
 *   supabase gen types typescript --project-id <project-ref> > src/types/database.ts
 *
 * which is not run in the Foundation milestone because no live Supabase
 * project is linked yet (see docs/implementation/foundation.md and
 * docs/local-supabase-strategy — not yet a real project until the
 * developer completes the manual setup step). Once a project exists, this
 * file should be regenerated via the command above and this comment
 * removed — do not hand-edit it after that point.
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
        };
        Update: {
          display_name?: string | null;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: string;
          base_currency: "GBP" | "USD" | "EUR";
          time_zone: string;
          appearance: "light" | "dark" | "system";
          monthly_income_target: string;
          secondary_monthly_income_target: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          base_currency?: "GBP" | "USD" | "EUR";
          time_zone?: string;
          appearance?: "light" | "dark" | "system";
          monthly_income_target?: string;
          secondary_monthly_income_target?: string;
        };
        Update: {
          base_currency?: "GBP" | "USD" | "EUR";
          time_zone?: string;
          appearance?: "light" | "dark" | "system";
          monthly_income_target?: string;
          secondary_monthly_income_target?: string;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          actor_id: string | null;
          event_type: string;
          entity_type: string;
          entity_id: string | null;
          occurred_at: string;
          correlation_id: string | null;
          metadata: Record<string, unknown>;
          source: "app" | "system";
          outcome: "success" | "failure";
        };
        Insert: {
          actor_id: string | null;
          event_type: string;
          entity_type: string;
          entity_id?: string | null;
          correlation_id?: string | null;
          metadata?: Record<string, unknown>;
          source?: "app" | "system";
          outcome: "success" | "failure";
        };
        Update: never; // append-only — see docs/audit-strategy.md
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
