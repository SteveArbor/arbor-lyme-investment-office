"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { composeAppServices } from "@/application/services";
import { UserFacingError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { logger } from "@/lib/logger";

export interface CompanyFormState {
  error: string | null;
}

export async function createCompanyAction(
  _prevState: CompanyFormState,
  formData: FormData
): Promise<CompanyFormState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { companyService } = composeAppServices(supabase);

  const input = {
    name: formData.get("name"),
    ticker: formData.get("ticker"),
    exchange: formData.get("exchange"),
    sector: formData.get("sector"),
    industry: formData.get("industry"),
    currency: formData.get("currency"),
    status: formData.get("status"),
    watchlist: formData.get("watchlist") === "on",
    notes: formData.get("notes") || null,
    profile: formData.get("profile") || null,
  };

  let companyId: string;
  try {
    const { company } = await companyService.createCompany(user.id, input, randomUUID());
    companyId = company.id;
  } catch (error) {
    if (error instanceof UserFacingError) {
      return {
        error: Object.values(error.fieldErrors).flat()[0] ?? error.message,
      };
    }
    logger.error("Server Action failed unexpectedly", {
      action: "createCompanyAction",
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Something went wrong. Please try again." };
  }

  redirect(`/companies/${companyId}`);
}
