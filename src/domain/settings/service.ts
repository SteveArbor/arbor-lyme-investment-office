import {
  createDomainEvent,
  type DomainEvent,
  NotFoundError,
  ValidationError,
} from "@/domain/shared";

import { type Settings, settingsUpdateSchema } from "./model";
import type { SettingsRepository } from "./repository";

export interface SettingsChangedPayload {
  userId: string;
  before: Settings;
  after: Settings;
  changedFields: string[];
}

/**
 * Business logic for reading/updating a user's Foundation settings.
 * Framework-independent (no Next.js, no Supabase) — testable with a plain
 * in-memory SettingsRepository, per docs/engineering-standards.md.
 *
 * Re-validates the update payload even though the calling Server Action
 * also validates at its boundary (docs/coding-standards.md) — this makes
 * the service safe to call from any future entry point (a Route Handler,
 * a test) without relying on every caller remembering to validate first.
 */
export class SettingsService {
  constructor(private readonly repository: SettingsRepository) {}

  async getSettings(userId: string): Promise<Settings> {
    const settings = await this.repository.getByUserId(userId);
    if (!settings) {
      throw new NotFoundError("Settings", userId);
    }
    return settings;
  }

  async updateSettings(
    userId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ settings: Settings; event: DomainEvent<SettingsChangedPayload> }> {
    const parsed = settingsUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid settings update",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      throw new ValidationError("No settings fields provided to update", {});
    }

    const before = await this.getSettings(userId);
    const after = await this.repository.update(userId, parsed.data);
    const changedFields = Object.keys(parsed.data);

    const event = createDomainEvent<SettingsChangedPayload>({
      type: "SettingsChanged",
      actorId: userId,
      correlationId,
      payload: { userId, before, after, changedFields },
    });

    return { settings: after, event };
  }
}
