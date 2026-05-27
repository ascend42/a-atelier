import { describe, it, expect } from "vitest";
import { WorkspaceManifestSchema } from "./workspace.js";

const base = {
  version: "1.0" as const,
  name: "my-studio",
  created: "2026-05-26T12:00:00.000Z",
  default_mode: "ambient" as const,
};

describe("WorkspaceManifestSchema", () => {
  it("accepts the minimal manifest shape", () => {
    const parsed = WorkspaceManifestSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("my-studio");
      expect(parsed.data.default_mode).toBe("ambient");
    }
  });

  it("accepts an optional description + projects list", () => {
    const parsed = WorkspaceManifestSchema.safeParse({
      ...base,
      description: "my creator workspace",
      projects: ["first-clip", "second-clip"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.projects).toEqual(["first-clip", "second-clip"]);
      expect(parsed.data.description).toBe("my creator workspace");
    }
  });

  it("accepts explicit mode = explicit", () => {
    const parsed = WorkspaceManifestSchema.safeParse({
      ...base,
      default_mode: "explicit",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown default_mode", () => {
    const parsed = WorkspaceManifestSchema.safeParse({
      ...base,
      default_mode: "ambivalent",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a wrong version literal", () => {
    const parsed = WorkspaceManifestSchema.safeParse({
      ...base,
      version: "2.0",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const parsed = WorkspaceManifestSchema.safeParse({
      ...base,
      name: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown top-level keys (.strict)", () => {
    const parsed = WorkspaceManifestSchema.safeParse({
      ...base,
      mystery: "field",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty project string", () => {
    const parsed = WorkspaceManifestSchema.safeParse({
      ...base,
      projects: [""],
    });
    expect(parsed.success).toBe(false);
  });
});
