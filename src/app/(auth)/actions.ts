"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { composeAppServices } from "@/application/services";
import { createSupabaseServerClient } from "@/infrastructure/auth";

const signInSchema = z.object({
  email: z.string().min(1, "Enter your email address").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export interface SignInFormState {
  error: string | null;
}

export async function signInAction(
  _prevState: SignInFormState,
  formData: FormData
): Promise<SignInFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    // Deliberately generic — does not distinguish "no such account" from
    // "wrong password", to avoid user enumeration (docs/threat-model.md §1).
    return { error: "Incorrect email or password." };
  }

  // Best-effort audit: docs/audit-strategy.md documents that Login/Logout
  // capture depends on this Server Action completing normally (a client
  // aborting the request mid-flow is a known, accepted limitation — see
  // docs/implementation/foundation.md).
  const { auditService } = composeAppServices(supabase);
  await auditService.record({
    actorId: data.user.id,
    eventType: "Login",
    entityType: "session",
    outcome: "success",
  });

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Audit BEFORE signing out: the insert-own-only RLS policy on
    // audit_events needs auth.uid() to still resolve to this user
    // (docs/audit-strategy.md, docs/data-flow.md §10).
    const { auditService } = composeAppServices(supabase);
    await auditService.record({
      actorId: user.id,
      eventType: "Logout",
      entityType: "session",
      outcome: "success",
    });
  }

  await supabase.auth.signOut();
  redirect("/sign-in");
}
