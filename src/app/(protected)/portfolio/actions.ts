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

  try {
    await portfolioService.createPortfolio(user.id, input, randomUUID());
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        error: Object.values(error.fieldErrors).flat()[0] ?? "Please check the highlighted fields.",
        success: false,
      };
    }
    return { error: "Something went wrong. Please try again.", success: false };
  }

  revalidatePath("/portfolio");
  return { error: null, success: true };
}
