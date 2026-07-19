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

async function requireUserAndServices() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, services: composeAppServices(supabase) };
}

export async function recordBuyAction(
  portfolioId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const { user, services } = await requireUserAndServices();
  if (!user) return { error: "You must be signed in.", success: false };

  const input = {
    companyId: formData.get("companyId"),
    quantity: Number(formData.get("quantity")),
    pricePerUnit: Number(formData.get("pricePerUnit")),
    occurredAt: new Date(String(formData.get("occurredAt"))).toISOString(),
    notes: formData.get("notes") || null,
  };

  try {
    await services.tradingService.recordBuy(user.id, portfolioId, input, randomUUID());
  } catch (error) {
    return fieldError(error);
  }

  revalidatePath("/portfolio/transactions");
  revalidatePath("/portfolio");
  return { error: null, success: true };
}

export async function recordSellAction(
  portfolioId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const { user, services } = await requireUserAndServices();
  if (!user) return { error: "You must be signed in.", success: false };

  const input = {
    companyId: formData.get("companyId"),
    quantity: Number(formData.get("quantity")),
    pricePerUnit: Number(formData.get("pricePerUnit")),
    occurredAt: new Date(String(formData.get("occurredAt"))).toISOString(),
    notes: formData.get("notes") || null,
  };

  try {
    await services.tradingService.recordSell(user.id, portfolioId, input, randomUUID());
  } catch (error) {
    return fieldError(error);
  }

  revalidatePath("/portfolio/transactions");
  revalidatePath("/portfolio");
  return { error: null, success: true };
}

export async function recordDividendAction(
  portfolioId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const { user, services } = await requireUserAndServices();
  if (!user) return { error: "You must be signed in.", success: false };

  const input = {
    companyId: formData.get("companyId"),
    amount: Number(formData.get("amount")),
    occurredAt: new Date(String(formData.get("occurredAt"))).toISOString(),
    notes: formData.get("notes") || null,
  };

  try {
    await services.tradingService.recordDividend(user.id, portfolioId, input, randomUUID());
  } catch (error) {
    return fieldError(error);
  }

  revalidatePath("/portfolio/transactions");
  revalidatePath("/portfolio");
  return { error: null, success: true };
}

export async function recordCashAdjustmentAction(
  portfolioId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const { user, services } = await requireUserAndServices();
  if (!user) return { error: "You must be signed in.", success: false };

  const input = {
    amount: Number(formData.get("amount")),
    occurredAt: new Date(String(formData.get("occurredAt"))).toISOString(),
    notes: formData.get("notes") || null,
  };

  try {
    await services.tradingService.recordCashAdjustment(user.id, portfolioId, input, randomUUID());
  } catch (error) {
    return fieldError(error);
  }

  revalidatePath("/portfolio/transactions");
  revalidatePath("/portfolio");
  return { error: null, success: true };
}
