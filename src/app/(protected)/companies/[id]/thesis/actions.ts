"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { composeAppServices } from "@/application/services";
import { UserFacingError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { logger } from "@/lib/logger";

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
    if (error instanceof UserFacingError) {
      return {
        error: Object.values(error.fieldErrors).flat()[0] ?? error.message,
        success: false,
      };
    }
    logger.error("Server Action failed unexpectedly", {
      action: "updateThesisAction",
      companyId,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Something went wrong. Please try again.", success: false };
  }

  revalidatePath(`/companies/${companyId}/thesis`);
  return { error: null, success: true };
}
