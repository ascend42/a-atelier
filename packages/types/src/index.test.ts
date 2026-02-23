import { describe, it, expectTypeOf } from "vitest";
import type { AtelierDocument, Layer, Delta, State, Canvas, UnitValue } from "./index.js";

describe("@a-company/atelier-types", () => {
  it("AtelierDocument has required fields", () => {
    expectTypeOf<AtelierDocument>().toHaveProperty("version");
    expectTypeOf<AtelierDocument>().toHaveProperty("name");
    expectTypeOf<AtelierDocument>().toHaveProperty("canvas");
    expectTypeOf<AtelierDocument>().toHaveProperty("layers");
    expectTypeOf<AtelierDocument>().toHaveProperty("states");
  });

  it("Canvas has width, height, fps", () => {
    expectTypeOf<Canvas>().toHaveProperty("width");
    expectTypeOf<Canvas>().toHaveProperty("height");
    expectTypeOf<Canvas>().toHaveProperty("fps");
  });

  it("Layer has id, visual, frame, bounds", () => {
    expectTypeOf<Layer>().toHaveProperty("id");
    expectTypeOf<Layer>().toHaveProperty("visual");
    expectTypeOf<Layer>().toHaveProperty("frame");
    expectTypeOf<Layer>().toHaveProperty("bounds");
  });

  it("Delta has layer, property, range, from, to", () => {
    expectTypeOf<Delta>().toHaveProperty("layer");
    expectTypeOf<Delta>().toHaveProperty("property");
    expectTypeOf<Delta>().toHaveProperty("range");
    expectTypeOf<Delta>().toHaveProperty("from");
    expectTypeOf<Delta>().toHaveProperty("to");
  });

  it("State has duration and deltas", () => {
    expectTypeOf<State>().toHaveProperty("duration");
    expectTypeOf<State>().toHaveProperty("deltas");
  });

  it("UnitValue accepts pixels and percentages", () => {
    expectTypeOf<100>().toMatchTypeOf<UnitValue>();
    expectTypeOf<"50%">().toMatchTypeOf<UnitValue>();
  });
});
