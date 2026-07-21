import type {
  PriceEngine,
  PriceQuote,
  SecurityIdentifier,
  SecurityPriceProvider,
  SecurityPriceProviderMap,
} from "@/domain/market";
import { ProviderUnavailableError } from "@/domain/shared";

/**
 * The `PriceEngine` implementation ADR 0030 described but deliberately
 * didn't build: a thin router with zero vendor-specific code, dispatching
 * each request to whichever `SecurityPriceProvider` the composition root
 * assigned to that `SecurityIdentifier.type`. This is the only place in
 * the codebase that ever reads `identifier.type` to make a routing
 * decision — everything upstream of this class just calls `PriceEngine`.
 */
export class RoutingPriceEngine implements PriceEngine {
  constructor(private readonly providers: SecurityPriceProviderMap) {}

  private resolve(type: SecurityIdentifier["type"]): SecurityPriceProvider {
    const provider = this.providers[type];
    if (!provider) {
      throw new ProviderUnavailableError(
        "Price Engine",
        `no provider configured for security type "${type}"`
      );
    }
    return provider;
  }

  async getPrice(identifier: SecurityIdentifier): Promise<PriceQuote> {
    return this.resolve(identifier.type).getPrice(identifier);
  }

  async getPrices(identifiers: SecurityIdentifier[]): Promise<PriceQuote[]> {
    // Grouped by type so each configured provider gets one batched call
    // (where it supports one) instead of N individual dispatches.
    const byType = new Map<SecurityIdentifier["type"], SecurityIdentifier[]>();
    for (const identifier of identifiers) {
      const group = byType.get(identifier.type) ?? [];
      group.push(identifier);
      byType.set(identifier.type, group);
    }

    const results = await Promise.all(
      Array.from(byType.entries()).map(([type, group]) => this.resolve(type).getPrices(group))
    );
    return results.flat();
  }
}
