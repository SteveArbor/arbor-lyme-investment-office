"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { getRequestContext } from "@/application/services";
import { ValidationError } from "@/domain/shared";

export interface ActionFormState {
  error: string | null;
  success: boolean;
}

export async function createPortfolioAction(
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const context = await getRequestContext();
  if (!context) return { error: "You must be signed in.", success: false };
  const { user, services } = context;

  const input = {
    name: formData.get("name"),
    cash: Number(formData.get("cash")),
  };

  let portfolioId: string;
  try {
    const { portfolio } = await services.portfolioService.createPortfolio(
      user.id,
      input,
      randomUUID()
    );
    portfolioId = portfolio.id;
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        error: Object.values(error.fieldErrors).flat()[0] ?? "Please check the highlighted fields.",
        success: false,
      };
    }
    return { error: "Something went wrong. Please try again.", success: false };
  }

  redirect(`/portfolio/${portfolioId}`);
}
