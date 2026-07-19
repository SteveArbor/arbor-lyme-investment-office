import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Explicit rather than relying on RTL's auto-cleanup detection: this
// project does not enable Vitest's `globals` option (imports are explicit
// throughout, matching docs/coding-standards.md's general preference for
// explicitness), which is what RTL's auto-detection looks for.
afterEach(() => {
  cleanup();
});
