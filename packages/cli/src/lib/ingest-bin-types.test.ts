import { describe, it, expect } from "vitest";
import { isValidMediaRefPath } from "./ingest-bin-types.js";

describe("isValidMediaRefPath", () => {
  describe("accepts valid media paths", () => {
    it("accepts a simple video path", () => {
      expect(isValidMediaRefPath("media/foo.mp4")).toBe(true);
    });

    it("accepts an uppercase MOV extension", () => {
      expect(isValidMediaRefPath("media/IMG_7346.MOV")).toBe(true);
    });

    it("accepts a filename with spaces", () => {
      expect(isValidMediaRefPath("media/track 1.wav")).toBe(true);
    });
  });

  describe("rejects invalid paths", () => {
    it("rejects empty string", () => {
      expect(isValidMediaRefPath("")).toBe(false);
    });

    it("rejects whitespace-only string", () => {
      expect(isValidMediaRefPath("   ")).toBe(false);
    });

    it("rejects path missing the media/ prefix", () => {
      expect(isValidMediaRefPath("foo.mp4")).toBe(false);
    });

    it("rejects prefix-only with no basename", () => {
      expect(isValidMediaRefPath("media/")).toBe(false);
    });

    it("rejects nested subdirectories under media/", () => {
      expect(isValidMediaRefPath("media/sub/foo.mp4")).toBe(false);
    });

    it("rejects path-traversal attempts", () => {
      expect(isValidMediaRefPath("media/../etc/passwd")).toBe(false);
    });

    it("rejects paths containing NUL bytes", () => {
      expect(isValidMediaRefPath("media/with\x00null")).toBe(false);
    });

    it("rejects undefined", () => {
      expect(isValidMediaRefPath(undefined)).toBe(false);
    });

    it("rejects null", () => {
      expect(isValidMediaRefPath(null)).toBe(false);
    });

    it("rejects numeric input", () => {
      expect(isValidMediaRefPath(123)).toBe(false);
    });
  });
});
