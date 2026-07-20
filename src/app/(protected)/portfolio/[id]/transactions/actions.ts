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
  // Anything else — including an RPC failure transaction-error-mapper.ts
  // didn't recognize — is logged here, server-side, with enough context to
  // find the failing call, and never shown to the user verbatim
  // (docs/implementation/staff-engineer-review.md finding H5). The mapper
  // already logs unexpected RPC failures with more detail (errcode); this
  // catches everything else (a thrown NotFoundError, a network failure).
  logger.error("Trading Server Action failed unexpectedly", {
    ...context,
    error: error instanceof Error ? error.message : String(error),
  });
  return { error: "Something went wrong. Please try again.", success: false };
}

async function requireUserAndServices() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, services: composeAppServices(supabase) };
}

function revalidatePortfolioPaths(portfolioId: string) {
  revalidatePath(`/portfolio/${portfolioId}/transactions`);
  revalidatePath(`/portfolio/${portfolioId}`);
}

function optionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
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
    notes: optionalString(formData, "notes"),
  };

  try {
    const { event } = await services.tradingService.recordBuy(
      user.id,
      portfolioId,
      input,
      randomUUID()
    );
    await services.eventBus.publish(event);
  } catch (error) {
    return fieldError(error, { action: "recordBuyAction", portfolioId, userId: user.id });
  }

  revalidatePortfolioPaths(portfolioId);
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
    notes: optionalString(formData, "notes"),
  };

  try {
    const { event } = await services.tradingService.recordSell(
      user.id,
      portfolioId,
      input,
      randomUUID()
    );
    await services.eventBus.publish(event);
  } catch (error) {
    return fieldError(error, { action: "recordSellAction", portfolioId, userId: user.id });
  }

  revalidatePortfolioPaths(portfolioId);
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
    notes: optionalString(formData, "notes"),
    reference: optionalString(formData, "reference"),
  };

  try {
    const { event } = await services.tradingService.recordDividend(
      user.id,
      portfolioId,
      input,
      randomUUID()
    );
    await services.eventBus.publish(event);
  } catch (error) {
    return fieldError(error, { action: "recordDividendAction", portfolioId, userId: user.id });
  }

  revalidatePortfolioPaths(portfolioId);
  return { error: null, success: true };
}

export async function recordFeeAction(
  portfolioId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const { user, services } = await requireUserAndServices();
  if (!user) return { error: "You must be signed in.", success: false };

  const input = {
    companyId: optionalString(formData, "companyId"),
    amount: Number(formData.get("amount")),
    occurredAt: new Date(String(formData.get("occurredAt"))).toISOString(),
    notes: optionalString(formData, "notes"),
    reference: optionalString(formData, "reference"),
  };

  try {
    const { event } = await services.tradingService.recordFee(
      user.id,
      portfolioId,
      input,
      randomUUID()
    );
    await services.eventBus.publish(event);
  } catch (error) {
    return fieldError(error, { action: "recordFeeAction", portfolioId, userId: user.id });
  }

  revalidatePortfolioPaths(portfolioId);
  return { error: null, success: true };
}

export async function recordInterestAction(
  portfolioId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const { user, services } = await requireUserAndServices();
  if (!user) return { error: "You must be signed in.", success: false };

  const input = {
    amount: Number(formData.get("amount")),
    occurredAt: new Date(String(formData.get("occurredAt"))).toISOString(),
    notes: optionalString(formData, "notes"),
    reference: optionalString(formData, "reference"),
  };

  try {
    const { event } = await services.tradingService.recordInterest(
      user.id,
      portfolioId,
      input,
      randomUUID()
    );
    await services.eventBus.publish(event);
  } catch (error) {
    return fieldError(error, { action: "recordInterestAction", portfolioId, userId: user.id });
  }

  revalidatePortfolioPaths(portfolioId);
  return { error: null, success: true };
}

export async function recordTaxAction(
  portfolioId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const { user, services } = await requireUserAndServices();
  if (!user) return { error: "You must be signed in.", success: false };

  const input = {
    companyId: optionalString(formData, "companyId"),
    amount: Number(formData.get("amount")),
    occurredAt: new Date(String(formData.get("occurredAt"))).toISOString(),
    notes: optionalString(formData, "notes"),
    reference: optionalString(formData, "reference"),
  };

  try {
    const { event } = await services.tradingService.recordTax(
      user.id,
      portfolioId,
      input,
      randomUUID()
    );
    await services.eventBus.publish(event);
  } catch (error) {
    return fieldError(error, { action: "recordTaxAction", portfolioId, userId: user.id });
  }

  revalidatePortfolioPaths(portfolioId);
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
    category: formData.get("category"),
    amount: Number(formData.get("amount")),
    occurredAt: new Date(String(formData.get("occurredAt"))).toISOString(),
    notes: optionalString(formData, "notes"),
    reference: optionalString(formData, "reference"),
  };

  try {
    const { event } = await services.tradingService.recordCashAdjustment(
      user.id,
      portfolioId,
      input,
      randomUUID()
    );
    await services.eventBus.publish(event);
  } catch (error) {
    return fieldError(error, {
      action: "recordCashAdjustmentAction",
      portfolioId,
      userId: user.id,
    });
  }

  revalidatePortfolioPaths(portfolioId);
  return { error: null, success: true };
}
