import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate, parseFilterOutput, parseHold, parseProbe, renderCheck, type FilterReadings } from "./render-check.js";

const probe = { duration: 6, fps: 30, hasVideo: true, hasAudio: true };
const readings = (over: Partial<FilterReadings> = {}): FilterReadings => ({
  freezes: [], blacks: [], cuts: [2, 3, 4.5], ydif: [5, 7, 6], meanVolumeDb: -20, ...over,
});

describe("parsers", () => {
  it("reads ffprobe json", () => {
    const p = parseProbe(JSON.stringify({
      streams: [{ codec_type: "video", r_frame_rate: "30000/1001" }, { codec_type: "audio" }],
      format: { duration: "12.5" },
    }));
    expect(p.duration).toBe(12.5);
    expect(p.fps).toBeCloseTo(29.97, 2);
    expect(p.hasAudio).toBe(true);
  });

  it("pairs freeze lines and runs an open freeze to the end", () => {
    const stderr = [
      "[Parsed_freezedetect_0 @ 0x1] lavfi.freezedetect.freeze_start: 2",
      "[Parsed_freezedetect_0 @ 0x1] lavfi.freezedetect.freeze_duration: 1",
      "[Parsed_freezedetect_0 @ 0x1] lavfi.freezedetect.freeze_end: 3",
      "[Parsed_freezedetect_0 @ 0x1] lavfi.freezedetect.freeze_start: 4",
      "[blackdetect @ 0x2] black_start:0 black_end:0.5 black_duration:0.5",
      "[Parsed_metadata_3 @ 0x3] lavfi.signalstats.YDIF=2.5",
      "[Parsed_metadata_3 @ 0x3] lavfi.signalstats.YDIF=7.5",
      "[Parsed_showinfo_5 @ 0x4] n:   0 pts:  61440 pts_time:2       duration:512",
      "[Parsed_volumedetect_0 @ 0x5] mean_volume: -18.4 dB",
    ].join("\n");
    const r = parseFilterOutput(stderr, 6);
    expect(r.freezes).toEqual([{ start: 2, end: 3 }, { start: 4, end: 6 }]);
    expect(r.blacks).toEqual([{ start: 0, end: 0.5 }]);
    expect(r.cuts).toEqual([2]);
    expect(r.ydif).toEqual([2.5, 7.5]);
    expect(r.meanVolumeDb).toBe(-18.4);
  });

  it("parses and rejects hold specs", () => {
    expect(parseHold("1.2-2.4")).toEqual({ start: 1.2, end: 2.4 });
    expect(() => parseHold("3-1")).toThrow();
  });
});

describe("gates", () => {
  it("passes a moving film with a short resolved end hold", () => {
    const r = evaluate("f.mp4", probe, readings({ freezes: [{ start: 5, end: 6 }] }), { expectSeconds: 6, expectAudio: true });
    expect(r.passed).toBe(true);
    expect(r.endHold.seconds).toBe(1);
  });

  it("G2 fails a dead run mid-film, unless the storyboard declares it", () => {
    const frozen = readings({ freezes: [{ start: 2, end: 3 }] });
    expect(evaluate("f.mp4", probe, frozen).gates.find((g) => g.id === "G2")?.status).toBe("fail");
    const declared = evaluate("f.mp4", probe, frozen, { allowHolds: [{ start: 1.9, end: 3.1 }] });
    expect(declared.gates.find((g) => g.id === "G2")?.status).toBe("pass");
  });

  it("G3 fails a long end hold and an overlong last shot", () => {
    const r = evaluate("f.mp4", probe, readings({ freezes: [{ start: 4, end: 6 }], cuts: [1] }));
    const g3 = r.gates.find((g) => g.id === "G3");
    expect(g3?.status).toBe("fail");
    expect(g3?.problems.join(" ")).toMatch(/end hold 2 s/);
    expect(g3?.problems.join(" ")).toMatch(/last shot is 83%/);
  });

  it("does not judge the last shot of a film without cuts", () => {
    const r = evaluate("f.mp4", probe, readings({ cuts: [] }));
    expect(r.gates.find((g) => g.id === "G3")?.status).toBe("pass");
  });

  it("G0 fails a blank, frozen, wrong-length or silent render", () => {
    const r = evaluate("f.mp4", probe,
      readings({ blacks: [{ start: 0, end: 6 }], freezes: [{ start: 0, end: 6 }], meanVolumeDb: -91 }),
      { expectSeconds: 15, expectAudio: true });
    expect(r.gates.find((g) => g.id === "G0")?.problems).toHaveLength(4);
  });

  it("reports density as a question, never a gate", () => {
    const busy = evaluate("f.mp4", probe, readings({ ydif: [14, 15] }));
    expect(busy.density.band).toBe("high");
    expect(busy.passed).toBe(true);
  });

  it("honours brand overrides of the thresholds", () => {
    const r = evaluate("f.mp4", probe, readings({ freezes: [{ start: 4, end: 6 }] }), { maxEndHold: 2.5 });
    expect(r.gates.find((g) => g.id === "G3")?.status).toBe("pass");
  });
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe.skipIf(!hasFfmpeg)("renderCheck on a real render", () => {
  it("finds the mid-film freeze and the long end hold", async () => {
    const dir = mkdtempSync(join(tmpdir(), "render-check-"));
    const out = join(dir, "synth.mp4");
    try {
      // 2 s moving, 1 s frozen colour, 1 s moving, 2 s frozen white
      const made = spawnSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=s=160x90:r=30:d=2",
        "-f", "lavfi", "-i", "color=c=navy:s=160x90:r=30:d=1",
        "-f", "lavfi", "-i", "testsrc2=s=160x90:r=30:d=1",
        "-f", "lavfi", "-i", "color=c=white:s=160x90:r=30:d=2",
        "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]",
        "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", out,
      ]);
      expect(made.status).toBe(0);
      const r = await renderCheck(out, { expectSeconds: 6 });
      expect(r.gates.find((g) => g.id === "G0")?.status).toBe("pass");
      expect(r.gates.find((g) => g.id === "G2")?.status).toBe("fail");
      expect(r.endHold.seconds).toBeCloseTo(2, 0);
      expect(r.gates.find((g) => g.id === "G3")?.status).toBe("fail");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});
