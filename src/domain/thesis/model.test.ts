import { describe, expect, it } from "vitest";

import { calculateOverallThesisStatus, type ThesisStatement } from "./model";

function statement(overrides: Partial<ThesisStatement>): ThesisStatement {
  return {
    id: "s1",
    description: "test",
    confidence: 0.8,
    status: "stable",
    ...overrides,
  };
}

describe("calculateOverallThesisStatus", () => {
  it("returns 'stable' for an empty statement list", () => {
    expect(calculateOverallThesisStatus([])).toBe("stable");
  });

  it("returns 'broken' if any single statement is broken, regardless of the others", () => {
    const statements = [
      statement({ status: "strengthening", confidence: 1 }),
      statement({ status: "strengthening", confidence: 1 }),
      statement({ status: "broken", confidence: 0.1 }),
    ];

    expect(calculateOverallThesisStatus(statements)).toBe("broken");
  });

  it("returns 'strengthening' when high-confidence statements are mostly strengthening", () => {
    const statements = [
      statement({ status: "strengthening", confidence: 0.9 }),
      statement({ status: "strengthening", confidence: 0.8 }),
      statement({ status: "stable", confidence: 0.5 }),
    ];

    expect(calculateOverallThesisStatus(statements)).toBe("strengthening");
  });

  it("returns 'weakening' when high-confidence statements are mostly weakening", () => {
    const statements = [
      statement({ status: "weakening", confidence: 0.9 }),
      statement({ status: "weakening", confidence: 0.7 }),
    ];

    expect(calculateOverallThesisStatus(statements)).toBe("weakening");
  });

  it("returns 'stable' when signals roughly cancel out", () => {
    const statements = [
      statement({ status: "strengthening", confidence: 0.5 }),
      statement({ status: "weakening", confidence: 0.5 }),
    ];

    expect(calculateOverallThesisStatus(statements)).toBe("stable");
  });

  it("weighs low-confidence statements less than high-confidence ones", () => {
    const statements = [
      statement({ status: "strengthening", confidence: 0.95 }),
      statement({ status: "weakening", confidence: 0.05 }),
    ];

    expect(calculateOverallThesisStatus(statements)).toBe("strengthening");
  });

  it("treats an all-zero-confidence list as 'stable' rather than dividing by zero", () => {
    const statements = [
      statement({ status: "strengthening", confidence: 0 }),
      statement({ status: "weakening", confidence: 0 }),
    ];

    expect(calculateOverallThesisStatus(statements)).toBe("stable");
  });
});
