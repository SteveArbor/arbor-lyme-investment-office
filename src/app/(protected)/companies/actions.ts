"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { getRequestContext } from "@/application/services";
import { ValidationError } from "@/domain/shared";

export interface CompanyFormState {
  error: string | null;
}

export async function createCompanyAction(
  _prevState: CompanyFormState,
  formData: FormData
): Promise<CompanyFormState> {
  const context = await getRequestContext();
  if (!context) return { error: "You must be signed in." };
  const { user, services } = context;

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
    const { company } = await services.companyService.createCompany(user.id, input, randomUUID());
    companyId = company.id;
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        error: Object.values(error.fieldErrors).flat()[0] ?? "Please check the form and try again.",
      };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect(`/companies/${companyId}`);
}
