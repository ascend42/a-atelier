// #doc-management-types tests — pure validator coverage.
//
// These tests pin the Aegis surface of the doc-management bundle so the three
// downstream builders (create / duplicate / delete) can rely on a stable
// contract for what counts as a valid user-typed doc name and what counts as
// the project manifest.

import { describe, expect, it } from "vitest";
import { isValidDocName } from "./doc-management-types.js";

describe("isValidDocName", () => {
  it("accepts a plain phrase with spaces", () => {
    expect(isValidDocName("Hello World")).toBe(true);
  });

  it("accepts kebab-case", () => {
    expect(isValidDocName("my-doc")).toBe(true);
  });

  it("accepts mixed spaces + digits", () => {
    expect(isValidDocName("slide 3")).toBe(true);
  });

  it("rejects undefined", () => {
    expect(isValidDocName(undefined)).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidDocName(null)).toBe(false);
  });

  it("rejects a number", () => {
    expect(isValidDocName(123)).toBe(false);
  });

  it("rejects an array", () => {
    expect(isValidDocName([])).toBe(false);
  });

  it("rejects a plain object", () => {
    expect(isValidDocName({})).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidDocName("")).toBe(false);
  });

  it("rejects whitespace-only", () => {
    expect(isValidDocName("   ")).toBe(false);
  });

  it("rejects parent-dir traversal", () => {
    expect(isValidDocName("../etc/passwd")).toBe(false);
  });

  it("rejects forward slash", () => {
    expect(isValidDocName("a/b")).toBe(false);
  });

  it("rejects backslash", () => {
    expect(isValidDocName("a\\b")).toBe(false);
  });

  it("rejects bare '..'", () => {
    expect(isValidDocName("..")).toBe(false);
  });

  it("rejects a hidden-dot leader", () => {
    expect(isValidDocName(".hidden")).toBe(false);
  });

  it("rejects an embedded NUL byte", () => {
    expect(isValidDocName("with\x00nul")).toBe(false);
  });

  it("rejects an embedded escape control byte", () => {
    expect(isValidDocName("with\x1bescape")).toBe(false);
  });

  it("rejects a 201-character string", () => {
    expect(isValidDocName("a".repeat(201))).toBe(false);
  });

  it("accepts a 200-character string at the boundary", () => {
    expect(isValidDocName("a".repeat(200))).toBe(true);
  });
});