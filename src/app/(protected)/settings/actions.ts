"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { composeAppServices } from "@/application/services";
import { UserFacingError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { logger } from "@/lib/logger";

export interface UpdateSettingsFormState {
  error: string | null;
  success: boolean;
}

export async function updateSettingsAction(
  _prevState: UpdateSettingsFormState,
  formData: FormData
): Promise<UpdateSettingsFormState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Should be unreachable — (protected)/layout.tsx already guards this
    // route — but the action is a valid entry point in its own right and
    // must not assume the layout ran first.
    return { error: "You must be signed in.", success: false };
  }

  const { settingsService, eventBus } = composeAppServices(supabase);

  const rawMonthlyTarget = formData.get("monthlyIncomeTarget");
  const rawSecondaryTarget = formData.get("secondaryMonthlyIncomeTarget");

  const input = {
    baseCurrency: formData.get("baseCurrency"),
    timeZone: formData.get("timeZone"),
    appearance: formData.get("appearance"),
    monthlyIncomeTarget: rawMonthlyTarget === null ? undefined : Number(rawMonthlyTarget),
    secondaryMonthlyIncomeTarget:
      rawSecondaryTarget === null ? undefined : Number(rawSecondaryTarget),
  };

  try {
    const { event } = await settingsService.updateSettings(user.id, input, randomUUID());
    await eventBus.publish(event);
  } catch (error) {
    if (error instanceof UserFacingError) {
      return { error: "Please check the highlighted fields and try again.", success: false };
    }
    logger.error("Server Action failed unexpectedly", {
      action: "updateSettingsAction",
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Something went wrong. Please try again.", success: false };
  }

  revalidatePath("/settings");
  return { error: null, success: true };
}
