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

type TransactionRow = {
  id: string;
  owner_id: string;
  portfolio_id: string;
  company_id: string | null;
  type: "buy" | "sell" | "dividend" | "cash_adjustment";
  quantity: string | null;
  price_per_unit: string | null;
  amount: string;
  realised_gain: string | null;
  occurred_at: string;
  notes: string | null;
  created_at: string;
};

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
      companies: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          ticker: string;
          exchange: string;
          sector: string;
          industry: string;
          currency: string;
          status: "researching" | "monitoring" | "holding" | "passed" | "archived";
          watchlist: boolean;
          notes: string | null;
          profile: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          name: string;
          ticker: string;
          exchange: string;
          sector: string;
          industry: string;
          currency: string;
          status?: "researching" | "monitoring" | "holding" | "passed" | "archived";
          watchlist?: boolean;
          notes?: string | null;
          profile?: string | null;
        };
        Update: {
          name?: string;
          ticker?: string;
          exchange?: string;
          sector?: string;
          industry?: string;
          currency?: string;
          status?: "researching" | "monitoring" | "holding" | "passed" | "archived";
          watchlist?: boolean;
          notes?: string | null;
          profile?: string | null;
        };
        Relationships: [];
      };
      entity_versions: {
        Row: {
          id: string;
          owner_id: string;
          entity_type: string;
          entity_id: string;
          version_number: number;
          snapshot: Record<string, unknown>;
          changed_by: string | null;
          changed_at: string;
          change_note: string | null;
        };
        Insert: {
          owner_id: string;
          entity_type: string;
          entity_id: string;
          snapshot: Record<string, unknown>;
          changed_by: string;
          change_note?: string | null;
        };
        Update: never; // append-only — see docs/database-design.md
        Relationships: [];
      };
      research_notes: {
        Row: {
          id: string;
          owner_id: string;
          company_id: string;
          business_overview: string | null;
          investment_thesis: string | null;
          economic_moat: string | null;
          management: string | null;
          financial_strength: string | null;
          capital_allocation: string | null;
          growth_drivers: string | null;
          risks: string | null;
          monitoring_metrics: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          company_id: string;
          business_overview?: string | null;
          investment_thesis?: string | null;
          economic_moat?: string | null;
          management?: string | null;
          financial_strength?: string | null;
          capital_allocation?: string | null;
          growth_drivers?: string | null;
          risks?: string | null;
          monitoring_metrics?: string | null;
          notes?: string | null;
        };
        Update: {
          business_overview?: string | null;
          investment_thesis?: string | null;
          economic_moat?: string | null;
          management?: string | null;
          financial_strength?: string | null;
          capital_allocation?: string | null;
          growth_drivers?: string | null;
          risks?: string | null;
          monitoring_metrics?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      theses: {
        Row: {
          id: string;
          owner_id: string;
          company_id: string;
          statements: unknown; // jsonb ThesisStatement[] — see src/domain/thesis/model.ts
          overall_status: "strengthening" | "stable" | "weakening" | "broken";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          company_id: string;
          statements?: unknown;
          overall_status?: "strengthening" | "stable" | "weakening" | "broken";
        };
        Update: {
          statements?: unknown;
          overall_status?: "strengthening" | "stable" | "weakening" | "broken";
        };
        Relationships: [];
      };
      valuations: {
        Row: {
          id: string;
          owner_id: string;
          company_id: string;
          projection_years: number;
          required_return: string;
          margin_of_safety: string;
          bear: unknown; // jsonb ValuationScenario — see src/domain/valuation/model.ts
          base: unknown;
          bull: unknown;
          blended_fair_value: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          company_id: string;
          projection_years?: number;
          required_return: number;
          margin_of_safety: number;
          bear: unknown;
          base: unknown;
          bull: unknown;
          blended_fair_value: number;
        };
        Update: {
          projection_years?: number;
          required_return?: number;
          margin_of_safety?: number;
          bear?: unknown;
          base?: unknown;
          bull?: unknown;
          blended_fair_value?: number;
        };
        Relationships: [];
      };
      decision_recommendations: {
        Row: {
          id: string;
          owner_id: string;
          company_id: string;
          inputs: unknown; // jsonb — see src/domain/decision/model.ts
          quality_score: string;
          valuation_score: string;
          overall_score: string;
          conviction: string;
          rating:
            "exceptional" | "strong_buy" | "buy" | "hold" | "reduce_conviction" | "sell" | "avoid";
          conclusion_source:
            "deterministic_rules" | "ai_analysis" | "manual_judgement" | "combined";
          generated_at: string;
        };
        Insert: {
          owner_id: string;
          company_id: string;
          inputs: unknown;
          quality_score: number;
          valuation_score: number;
          overall_score: number;
          conviction: number;
          rating:
            "exceptional" | "strong_buy" | "buy" | "hold" | "reduce_conviction" | "sell" | "avoid";
          conclusion_source?:
            "deterministic_rules" | "ai_analysis" | "manual_judgement" | "combined";
        };
        Update: never; // append-only — see docs/audit-strategy.md's pattern
        Relationships: [];
      };
      portfolios: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          cash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          name: string;
          cash?: number;
        };
        Update: {
          name?: string;
          cash?: number;
        };
        Relationships: [];
      };
      holdings: {
        Row: {
          id: string;
          owner_id: string;
          portfolio_id: string;
          company_id: string;
          quantity: string;
          average_cost: string;
          target_allocation_percent: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          portfolio_id: string;
          company_id: string;
          quantity?: number;
          average_cost?: number;
          target_allocation_percent?: number;
        };
        Update: {
          quantity?: number;
          average_cost?: number;
          target_allocation_percent?: number;
        };
        Relationships: [];
      };
      transactions: {
        Row: TransactionRow;
        Insert: {
          owner_id: string;
          portfolio_id: string;
          company_id?: string | null;
          type: "buy" | "sell" | "dividend" | "cash_adjustment";
          quantity?: number | null;
          price_per_unit?: number | null;
          amount: number;
          realised_gain?: number | null;
          occurred_at: string;
          notes?: string | null;
        };
        Update: never; // append-only — see docs/audit-strategy.md
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          owner_id: string;
          company_id: string;
          portfolio_id: string;
          status: "open" | "closed";
          purchase_date: string;
          purchase_price: string;
          fair_value_at_purchase: string;
          expected_return_at_purchase: string;
          position_size: string;
          conviction_at_purchase: string;
          thesis_summary: string;
          risks: string;
          invalidation_conditions: string;
          sale_date: string | null;
          sale_reason: string | null;
          lessons_learned: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          company_id: string;
          portfolio_id: string;
          status?: "open" | "closed";
          purchase_date: string;
          purchase_price: number;
          fair_value_at_purchase: number;
          expected_return_at_purchase: number;
          position_size: number;
          conviction_at_purchase: number;
          thesis_summary: string;
          risks?: string;
          invalidation_conditions?: string;
        };
        Update: {
          status?: "open" | "closed";
          sale_date?: string | null;
          sale_reason?: string | null;
          lessons_learned?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_buy_transaction: {
        Args: {
          p_owner_id: string;
          p_portfolio_id: string;
          p_company_id: string;
          p_quantity: number;
          p_price_per_unit: number;
          p_occurred_at: string;
          p_notes: string | null;
          p_expected_holding_quantity: number;
          p_expected_holding_average_cost: number;
          p_new_holding_quantity: number;
          p_new_holding_average_cost: number;
        };
        Returns: TransactionRow;
      };
      record_sell_transaction: {
        Args: {
          p_owner_id: string;
          p_portfolio_id: string;
          p_company_id: string;
          p_quantity: number;
          p_price_per_unit: number;
          p_occurred_at: string;
          p_notes: string | null;
          p_expected_holding_quantity: number;
          p_expected_holding_average_cost: number;
          p_new_holding_quantity: number;
          p_new_holding_average_cost: number;
          p_realised_gain: number;
        };
        Returns: TransactionRow;
      };
      record_dividend_transaction: {
        Args: {
          p_owner_id: string;
          p_portfolio_id: string;
          p_company_id: string;
          p_amount: number;
          p_occurred_at: string;
          p_notes: string | null;
        };
        Returns: TransactionRow;
      };
      record_cash_adjustment_transaction: {
        Args: {
          p_owner_id: string;
          p_portfolio_id: string;
          p_amount: number;
          p_occurred_at: string;
          p_notes: string | null;
        };
        Returns: TransactionRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
