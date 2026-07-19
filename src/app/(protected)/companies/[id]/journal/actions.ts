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

function fieldError(error: unknown): ActionFormState {
  if (error instanceof ValidationError) {
    return {
      error: Object.values(error.fieldErrors).flat()[0] ?? "Please check the highlighted fields.",
      success: false,
    };
  }
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
    return fieldError(error);
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
    return fieldError(error);
  }

  revalidatePath(`/companies/${companyId}/journal`);
  return { error: null, success: true };
}
