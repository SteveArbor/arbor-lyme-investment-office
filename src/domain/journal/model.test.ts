import { describe, expect, it } from "vitest";

import { calculateHoldingPeriodDays, calculateJournalCompleteness } from "./model";

describe("calculateHoldingPeriodDays", () => {
  it("returns null while the position remains open", () => {
    expect(calculateHoldingPeriodDays("2026-01-01T00:00:00.000Z", null)).toBeNull();
  });

  it("computes the whole-day span between purchase and sale", () => {
    expect(calculateHoldingPeriodDays("2026-01-01T00:00:00.000Z", "2026-01-11T00:00:00.000Z")).toBe(
      10
    );
  });

  it("never returns a negative period", () => {
    expect(calculateHoldingPeriodDays("2026-01-11T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).toBe(
      0
    );
  });
});

describe("calculateJournalCompleteness", () => {
  it("reports every field absent when no entry exists at all", () => {
    const result = calculateJournalCompleteness(null, null);
    expect(result.completePercent).toBe(0);
    expect(result.fields.every((f) => !f.present)).toBe(true);
  });

  it("reports thesis/expectedOutcome/confidence present once a full entry exists", () => {
    const result = calculateJournalCompleteness(
      { risks: "Competitive risk from rivals", invalidationConditions: "Margin compression" },
      "stable"
    );
    expect(result.fields.find((f) => f.key === "thesis")?.present).toBe(true);
    expect(result.fields.find((f) => f.key === "expectedOutcome")?.present).toBe(true);
    expect(result.fields.find((f) => f.key === "confidence")?.present).toBe(true);
    expect(result.fields.find((f) => f.key === "thesisStatus")?.present).toBe(true);
  });

  it("treats an entry with blank risks/exit strategy text as incomplete for those fields specifically", () => {
    const result = calculateJournalCompleteness({ risks: "  ", invalidationConditions: "" }, null);
    expect(result.fields.find((f) => f.key === "risks")?.present).toBe(false);
    expect(result.fields.find((f) => f.key === "exitStrategy")?.present).toBe(false);
    // thesis itself is still present -- the entry exists, just missing those two specific texts.
    expect(result.fields.find((f) => f.key === "thesis")?.present).toBe(true);
  });

  it("always reports reviewDate absent — not yet a supported field", () => {
    const result = calculateJournalCompleteness(
      { risks: "x", invalidationConditions: "y" },
      "stable"
    );
    expect(result.fields.find((f) => f.key === "reviewDate")?.present).toBe(false);
  });

  it("computes completePercent as the fraction of present fields", () => {
    const result = calculateJournalCompleteness(
      { risks: "x", invalidationConditions: "y" },
      "stable"
    );
    // 6 of 7 fields present (reviewDate always absent)
    expect(result.completePercent).toBeCloseTo(6 / 7, 6);
  });
});
