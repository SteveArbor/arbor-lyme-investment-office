import { describe, expect, it } from "vitest";

import { deriveCountryFromExchange } from "./model";

describe("deriveCountryFromExchange", () => {
  it("maps known exchanges to their country", () => {
    expect(deriveCountryFromExchange("NASDAQ")).toBe("United States");
    expect(deriveCountryFromExchange("NYSE")).toBe("United States");
    expect(deriveCountryFromExchange("LSE")).toBe("United Kingdom");
    expect(deriveCountryFromExchange("Euronext Amsterdam")).toBe("Netherlands");
    expect(deriveCountryFromExchange("Hargreaves Lansdown Fund Platform")).toBe("United Kingdom");
  });

  it("returns Unknown rather than guessing for an unrecognised exchange", () => {
    expect(deriveCountryFromExchange("Some New Exchange")).toBe("Unknown");
  });
});
