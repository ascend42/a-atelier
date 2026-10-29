import { describe, expect, it } from "vitest";
import { loadProducer, PRODUCER_MISSING_MESSAGE, PRODUCER_RANGE } from "./producer-runner.js";

function missing(code: string, specifier: string): Error {
  return Object.assign(new Error(`Cannot find package '${specifier}' imported from /x/dist/index.js`), { code });
}

describe("loadProducer", () => {
  it("turns a missing ESM producer into the install hint", async () => {
    const cause = missing("ERR_MODULE_NOT_FOUND", "@hyperframes/producer");
    const err = await loadProducer(() => Promise.reject(cause)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(PRODUCER_MISSING_MESSAGE);
    expect((err as Error).message).toContain(`@hyperframes/producer@${PRODUCER_RANGE}`);
    expect((err as Error).cause).toBe(cause);
  });

  it("turns a missing CJS producer into the install hint", async () => {
    const cause = missing("MODULE_NOT_FOUND", "@hyperframes/producer");
    await expect(loadProducer(() => Promise.reject(cause))).rejects.toThrow(PRODUCER_MISSING_MESSAGE);
  });

  it("rethrows a missing transitive package unchanged", async () => {
    const cause = missing("ERR_MODULE_NOT_FOUND", "puppeteer");
    await expect(loadProducer(() => Promise.reject(cause))).rejects.toBe(cause);
  });

  it("rethrows other load failures unchanged", async () => {
    const cause = new SyntaxError("boom");
    await expect(loadProducer(() => Promise.reject(cause))).rejects.toBe(cause);
  });

  it("loads the installed producer 0.8 render API", async () => {
    const producer = await loadProducer();
    expect(typeof producer.createRenderJob).toBe("function");
    expect(typeof producer.executeRenderJob).toBe("function");
    const job = producer.createRenderJob({ fps: { num: 30, den: 1 }, quality: "high", format: "mp4" });
    expect(job.status).toBe("queued");
    expect(job.config.quality).toBe("high");
  });
});
