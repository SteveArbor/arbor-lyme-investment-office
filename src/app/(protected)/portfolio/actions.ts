"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { composeAppServices } from "@/application/services";
import { UserFacingError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { logger } from "@/lib/logger";

export interface ActionFormState {
  error: string | null;
  success: boolean;
}

export async function createPortfolioAction(
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in.", success: false };

  const { portfolioService } = composeAppServices(supabase);

  const input = {
    name: formData.get("name"),
    cash: Number(formData.get("cash")),
  };

  let portfolioId: string;
  try {
    const { portfolio } = await portfolioService.createPortfolio(user.id, input, randomUUID());
    portfolioId = portfolio.id;
  } catch (error) {
    if (error instanceof UserFacingError) {
      return {
        error: Object.values(error.fieldErrors).flat()[0] ?? error.message,
        success: false,
      };
    }
    logger.error("Server Action failed unexpectedly", {
      action: "createPortfolioAction",
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Something went wrong. Please try again.", success: false };
  }

  redirect(`/portfolio/${portfolioId}`);
}
