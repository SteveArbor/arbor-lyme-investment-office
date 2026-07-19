import { notFound } from "next/navigation";
import { cache } from "react";

import { composeAppServices } from "@/application/services";
import type { Company } from "@/domain/company";
import { NotFoundError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";

/**
 * `layout.tsx` (for the name/404 check) and `page.tsx` (for the full
 * profile) both need this company on every request to a company sub-page
 * — wrapped in React's `cache()` so the two calls within the same request
 * share one fetch instead of two. Request-scoped only: a second, later
 * request always fetches fresh (this is not a cross-request cache).
 */
export const getCompanyOrNotFound = cache(
  async (ownerId: string, companyId: string): Promise<Company> => {
    const supabase = await createSupabaseServerClient();
    const { companyService } = composeAppServices(supabase);
    try {
      return await companyService.getCompany(ownerId, companyId);
    } catch (error) {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }
  }
);
