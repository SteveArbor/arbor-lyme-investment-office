import type { SupabaseClient } from "@supabase/supabase-js";

import { AuditService } from "@/domain/audit";
import { SettingsService } from "@/domain/settings";
import { SupabaseAuditRepository, SupabaseSettingsRepository } from "@/infrastructure/database";
import { InProcessEventBus } from "@/infrastructure/events";
import type { Database } from "@/types/database";

import { registerAuditSubscriptions } from "./audit-subscribers";

/**
 * The Foundation milestone's composition root: the one place that knows
 * concrete domain-service and repository classes exist (mirrors
 * docs/provider-architecture.md's "small composition module" pattern).
 * Server Actions and Route Handlers call this once per request rather than
 * constructing services themselves.
 *
 * A fresh event bus is built per request — see docs/event-system.md's
 * serverless-constraint explanation for why this cannot be a shared,
 * long-lived instance.
 */
export function composeFoundationServices(client: SupabaseClient<Database>) {
  const eventBus = new InProcessEventBus();
  const settingsService = new SettingsService(new SupabaseSettingsRepository(client));
  const auditService = new AuditService(new SupabaseAuditRepository(client));

  registerAuditSubscriptions(eventBus, auditService);

  return { eventBus, settingsService, auditService };
}
