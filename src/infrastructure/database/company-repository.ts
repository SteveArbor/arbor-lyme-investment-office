import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Company,
  CompanyListFilter,
  CompanyRepository,
  CompanyUpdate,
} from "@/domain/company";
import type { Database } from "@/types/database";

type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type CompanyUpdateRow = Database["public"]["Tables"]["companies"]["Update"];

function toDomain(row: CompanyRow): Company {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    ticker: row.ticker,
    exchange: row.exchange,
    sector: row.sector,
    industry: row.industry,
    currency: row.currency,
    status: row.status,
    watchlist: row.watchlist,
    notes: row.notes,
    profile: row.profile,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(patch: CompanyUpdate): CompanyUpdateRow {
  const row: CompanyUpdateRow = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.ticker !== undefined) row.ticker = patch.ticker;
  if (patch.exchange !== undefined) row.exchange = patch.exchange;
  if (patch.sector !== undefined) row.sector = patch.sector;
  if (patch.industry !== undefined) row.industry = patch.industry;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.watchlist !== undefined) row.watchlist = patch.watchlist;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.profile !== undefined) row.profile = patch.profile;
  return row;
}

export class SupabaseCompanyRepository implements CompanyRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getById(ownerId: string, companyId: string): Promise<Company | null> {
    const { data, error } = await this.client
      .from("companies")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", companyId)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async getByTicker(ownerId: string, ticker: string): Promise<Company | null> {
    const { data, error } = await this.client
      .from("companies")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("ticker", ticker)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async list(ownerId: string, filter?: CompanyListFilter): Promise<Company[]> {
    let query = this.client.from("companies").select("*").eq("owner_id", ownerId);

    if (filter?.status) {
      query = query.eq("status", filter.status);
    }
    if (filter?.watchlistOnly) {
      query = query.eq("watchlist", true);
    }
    if (filter?.search) {
      // `.or()` takes a raw PostgREST filter string — `,`/`(`/`)` are
      // syntax delimiters there, and `%`/`_` are ILIKE wildcards, so an
      // unescaped search term could alter which filter this call actually
      // applies (docs/PROJECT_STATUS.md Technical Debt, fixed alongside
      // Milestone 2.7's Companies search UI rather than left dormant).
      const escaped = filter.search.replace(/[,()%_\\]/g, (char) => `\\${char}`);
      query = query.or(`name.ilike.%${escaped}%,ticker.ilike.%${escaped}%`);
    }

    const { data, error } = await query.order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async create(
    ownerId: string,
    input: Parameters<CompanyRepository["create"]>[1]
  ): Promise<Company> {
    const { data, error } = await this.client
      .from("companies")
      .insert({
        owner_id: ownerId,
        name: input.name,
        ticker: input.ticker,
        exchange: input.exchange,
        sector: input.sector,
        industry: input.industry,
        currency: input.currency,
        status: input.status,
        watchlist: input.watchlist,
        notes: input.notes,
        profile: input.profile,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }

  async update(ownerId: string, companyId: string, patch: CompanyUpdate): Promise<Company> {
    const { data, error } = await this.client
      .from("companies")
      .update(toRow(patch))
      .eq("owner_id", ownerId)
      .eq("id", companyId)
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }
}
