import { describe, it, expect } from "vitest";

describe("@atelier/cli", () => {
  it("should be importable", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
  });
});
