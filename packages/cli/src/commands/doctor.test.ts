// #cli-doctor tests — `atelier doctor` reports what a fresh machine is missing
// and the command that fixes it. Read-only; never touches the real home.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDoctor } from "./doctor.js";
import { runSetup } from "./setup.js";

let home: string;
let bin: string;

const byId = (checks: ReturnType<typeof runDoctor>, id: string) => checks.find((c) => c.id === id)!;

function fakeBins(names: string[]): void {
  for (const n of names) writeFileSync(join(bin, n), "#!/bin/sh\n", { mode: 0o755 });
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "atelier-doctor-home-"));
  bin = join(home, "bin");
  mkdirSync(bin);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("runDoctor", () => {
  it("fails on a fresh machine and points at atelier setup", () => {
    const checks = runDoctor({ homeDir: home, pathEnv: bin });
    expect(byId(checks, "skills")).toMatchObject({ status: "fail", fix: "atelier setup" });
    expect(byId(checks, "crew").status).toBe("warn");
    expect(byId(checks, "config").status).toBe("warn");
    expect(byId(checks, "cli").status).toBe("warn");
  });

  it("is ready after setup, with the CLI recorded even off PATH", () => {
    runSetup({ homeDir: home, cliPath: "/opt/atelier/dist/cli.js", pathEnv: bin });
    const checks = runDoctor({ homeDir: home, pathEnv: bin });
    expect(checks.some((c) => c.status === "fail")).toBe(false);
    for (const id of ["skills", "agents", "crew", "config", "cli"]) expect(byId(checks, id).status, id).toBe("ok");
    expect(byId(checks, "cli").message).toContain("node");
  });

  it("flags outdated skills after an upgrade", () => {
    runSetup({ homeDir: home });
    writeFileSync(join(home, ".claude/skills/atelier-design/SKILL.md"), "old");
    expect(byId(runDoctor({ homeDir: home, pathEnv: bin }), "skills")).toMatchObject({ status: "warn", fix: "atelier setup" });
  });

  it("flags a home studio that no longer exists", () => {
    mkdirSync(join(home, ".atelier"));
    writeFileSync(join(home, ".atelier/config.yaml"), `home: ${join(home, "gone")}\n`);
    expect(byId(runDoctor({ homeDir: home, pathEnv: bin }), "config").status).toBe("warn");
  });

  it("checks media tools for episode runs and Node version", () => {
    fakeBins(["ffmpeg", "ffprobe", "whisper-cli", "atelier"]);
    const checks = runDoctor({ homeDir: home, pathEnv: bin, nodeVersion: "18.19.0" });
    expect(byId(checks, "media").status).toBe("ok");
    expect(byId(checks, "cli").status).toBe("ok");
    expect(byId(checks, "node").status).toBe("fail");
  });
});
