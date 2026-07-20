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

function fieldError(error: unknown, context: Record<string, unknown>): ActionFormState {
  if (error instanceof UserFacingError) {
    return {
      error: Object.values(error.fieldErrors).flat()[0] ?? error.message,
      success: false,
    };
  }
  logger.error("Server Action failed unexpectedly", {
    ...context,
    error: error instanceof Error ? error.message : String(error),
  });
  return { error: "Something went wrong. Please try again.", success: false };
}

export async function openJournalEntryAction(
  companyId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in.", success: false };

  const { journalService, eventBus } = composeAppServices(supabase);

  const input = {
    companyId,
    portfolioId: formData.get("portfolioId"),
    purchaseDate: new Date(String(formData.get("purchaseDate"))).toISOString(),
    purchasePrice: Number(formData.get("purchasePrice")),
    fairValueAtPurchase: Number(formData.get("fairValueAtPurchase")),
    expectedReturnAtPurchase: Number(formData.get("expectedReturnAtPurchase")),
    positionSize: Number(formData.get("positionSize")),
    convictionAtPurchase: Number(formData.get("convictionAtPurchase")),
    thesisSummary: formData.get("thesisSummary"),
    risks: formData.get("risks") ?? "",
    invalidationConditions: formData.get("invalidationConditions") ?? "",
  };

  try {
    const { event } = await journalService.openEntry(user.id, input, randomUUID());
    await eventBus.publish(event);
  } catch (error) {
    return fieldError(error, { action: "openJournalEntryAction", companyId, userId: user.id });
  }

  revalidatePath(`/companies/${companyId}/journal`);
  return { error: null, success: true };
}

export async function closeJournalEntryAction(
  companyId: string,
  entryId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in.", success: false };

  const { journalService, eventBus } = composeAppServices(supabase);

  const input = {
    saleDate: new Date(String(formData.get("saleDate"))).toISOString(),
    saleReason: formData.get("saleReason"),
    lessonsLearned: formData.get("lessonsLearned") ?? "",
  };

  try {
    const { event } = await journalService.closeEntry(user.id, entryId, input, randomUUID());
    await eventBus.publish(event);
  } catch (error) {
    return fieldError(error, {
      action: "closeJournalEntryAction",
      companyId,
      entryId,
      userId: user.id,
    });
  }

  revalidatePath(`/companies/${companyId}/journal`);
  return { error: null, success: true };
}
