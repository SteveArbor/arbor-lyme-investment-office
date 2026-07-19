"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getRequestContext } from "@/application/services";
import { ValidationError } from "@/domain/shared";

export interface ActionFormState {
  error: string | null;
  success: boolean;
}

const SECTIONS = [
  "businessOverview",
  "investmentThesis",
  "economicMoat",
  "management",
  "financialStrength",
  "capitalAllocation",
  "growthDrivers",
  "risks",
  "monitoringMetrics",
  "notes",
] as const;

export async function updateResearchAction(
  companyId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const context = await getRequestContext();
  if (!context) return { error: "You must be signed in.", success: false };
  const { user, services } = context;

  const input = Object.fromEntries(
    SECTIONS.map((section) => {
      const value = formData.get(section);
      return [section, value === "" ? null : value];
    })
  );

  try {
    const { event } = await services.researchService.updateResearch(
      user.id,
      companyId,
      input,
      user.id,
      randomUUID()
    );
    await services.eventBus.publish(event);
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        error: Object.values(error.fieldErrors).flat()[0] ?? "Please check the highlighted fields.",
        success: false,
      };
    }
    return { error: "Something went wrong. Please try again.", success: false };
  }

  revalidatePath(`/companies/${companyId}/research`);
  return { error: null, success: true };
}
