"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { composeAppServices } from "@/application/services";
import { ValidationError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";

export interface ActionFormState {
  error: string | null;
  success: boolean;
}

export async function updateThesisAction(
  companyId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in.", success: false };

  const { thesisService, eventBus } = composeAppServices(supabase);

  let statements: unknown;
  try {
    statements = JSON.parse(String(formData.get("statements") ?? "[]"));
  } catch {
    return { error: "Malformed thesis statements.", success: false };
  }

  try {
    const { event } = await thesisService.updateStatements(
      user.id,
      companyId,
      { statements },
      user.id,
      randomUUID()
    );
    await eventBus.publish(event);
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
