import type { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseHold, renderCheck, type Interval, type RenderCheckReport } from "../lib/render-check.js";

/**
 * `atelier render-check <video>` — read a render and print the motion gates
 * (G0 render exists, G2 no dead frames, G3 short ending) plus motion density
 * as a question. Iris runs it on every render and quotes the numbers; a fail
 * is fixed, not argued. Exit 1 when any gate fails.
 *
 *   atelier render-check final.mp4 --expect 20 --expect-audio --allow-hold 8.2-9.4 [--json]
 */
export function renderCheckCommand(program: Command): void {
  program
    .command("render-check <video>")
    .description("Check a rendered video against the motion gates (dead frames, end hold, length, audio)")
    .option("--expect <seconds>", "Planned length in seconds", parseFloat)
    .option("--expect-audio", "Audio is planned: it must exist and not be silent")
    .option(
      "--allow-hold <start-end>",
      "A designed hold the storyboard declares, in seconds (repeatable)",
      (v: string, acc: Interval[]) => [...acc, parseHold(v)],
      [] as Interval[],
    )
    .option("--max-flat-frames <n>", "Longest allowed frozen run in frames (default 3)", parseFloat)
    .option("--max-end-hold <seconds>", "Longest allowed end hold (default 1.4)", parseFloat)
    .option("--max-final-shot <share>", "Largest share of the film for the last shot (default 0.25)", parseFloat)
    .option("--json", "Emit a machine-readable JSON report")
    .action(
      async (
        video: string,
        opts: {
          expect?: number;
          expectAudio?: boolean;
          allowHold: Interval[];
          maxFlatFrames?: number;
          maxEndHold?: number;
          maxFinalShot?: number;
          json?: boolean;
        },
      ) => {
        const file = resolve(video);
        if (!existsSync(file)) {
          console.error(`No such file: ${video}`);
          process.exit(2);
        }
        let report: RenderCheckReport;
        try {
          report = await renderCheck(file, {
            expectSeconds: opts.expect,
            expectAudio: opts.expectAudio,
            allowHolds: opts.allowHold,
            maxFlatFrames: opts.maxFlatFrames,
            maxEndHold: opts.maxEndHold,
            maxFinalShot: opts.maxFinalShot,
          });
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(2);
        }
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printReport(report);
        }
        if (!report.passed) process.exit(1);
      },
    );
}

function printReport(r: RenderCheckReport): void {
  console.log("  Atelier render check");
  console.log(`  ${r.file}`);
  console.log("");
  for (const g of r.gates) {
    const nums = Object.entries(g.numbers).map(([k, v]) => `${k}=${v}`).join("  ");
    console.log(`  ${g.status === "pass" ? "✓" : "✗"} ${g.id} ${g.name.padEnd(15)} ${nums}`);
    for (const p of g.problems) console.log(`      ${p}`);
  }
  console.log("");
  console.log(`  motion density  ${r.density.meanFrameChange} (${r.density.band}; human films 4.4-9.8, median 6.8)`);
  if (r.density.question) console.log(`      ${r.density.question}`);
  if (r.endHold.note) console.log(`  end hold        ${r.endHold.note}`);
  if (r.declaredHolds.length) {
    console.log(`  declared holds  ${r.declaredHolds.map((h) => `${h.start}-${h.end} s`).join(", ")}`);
  }
  console.log("");
  console.log("  Judged by eye (no script; say so in the notes):");
  for (const b of r.byEye) console.log(`    - ${b}`);
  console.log("");
  console.log(r.passed ? "  Gates pass. Quote these numbers; don't call the film good." : "  A gate failed. Fix it, then re-run.");
}
