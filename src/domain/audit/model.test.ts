import { describe, expect, it } from "vitest";

import { sanitizeAuditMetadata } from "./model";

describe("sanitizeAuditMetadata", () => {
  it("strips top-level keys matching the sensitive pattern", () => {
    const result = sanitizeAuditMetadata({
      password: "hunter2",
      token: "abc",
      apiKey: "xyz",
      api_key: "xyz",
      authorization: "Bearer abc",
      cookie: "session=1",
      sessionId: "abc",
      safeField: "keep me",
    });

    expect(result).toEqual({ safeField: "keep me" });
  });

  it("strips sensitive keys recursively in nested objects", () => {
    const result = sanitizeAuditMetadata({
      user: {
        name: "Alice",
        password: "hunter2",
        nested: {
          secret: "hidden",
          visible: "kept",
        },
      },
    });

    expect(result).toEqual({
      user: {
        name: "Alice",
        nested: {
          visible: "kept",
        },
      },
    });
  });

  it("is case-insensitive and matches partial key names", () => {
    const result = sanitizeAuditMetadata({
      UserPassword: "x",
      RefreshToken: "y",
      keep: "z",
    });

    expect(result).toEqual({ keep: "z" });
  });

  it("leaves arrays and primitives untouched", () => {
    const result = sanitizeAuditMetadata({
      tags: ["a", "b"],
      count: 3,
      active: true,
      note: null,
    });

    expect(result).toEqual({ tags: ["a", "b"], count: 3, active: true, note: null });
  });

  it("returns an empty object for empty input", () => {
    expect(sanitizeAuditMetadata({})).toEqual({});
  });
});
