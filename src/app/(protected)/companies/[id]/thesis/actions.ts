"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getRequestContext } from "@/application/services";
import { ValidationError } from "@/domain/shared";

export interface ActionFormState {
  error: string | null;
  success: boolean;
}

export async function updateThesisAction(
  companyId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const context = await getRequestContext();
  if (!context) return { error: "You must be signed in.", success: false };
  const { user, services } = context;

  let statements: unknown;
  try {
    statements = JSON.parse(String(formData.get("statements") ?? "[]"));
  } catch {
    return { error: "Malformed thesis statements.", success: false };
  }

  try {
    const { event } = await services.thesisService.updateStatements(
      user.id,
      companyId,
      { statements },
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

  revalidatePath(`/companies/${companyId}/thesis`);
  return { error: null, success: true };
}
