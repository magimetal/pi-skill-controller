import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import createSkillControllerExtension from "../extensions/skill-controller/create-skill-controller-extension.js";
import {
  formatCancelMessage,
  formatCommandError,
  formatSaveMessage,
  registerScopedSkillControlCommand,
} from "../extensions/skill-controller/commands.js";
import { SkillControllerOverlay } from "../extensions/skill-controller/ui.js";
import type { SkillControllerUISelection, SkillRecord } from "../extensions/skill-controller/types.js";
import { createFixtureRoot, writeSkill } from "./test-support/skill-controller-fixtures.js";

const theme = {
  fg: (_token: string, value: string) => value,
  bold: (value: string) => value,
} as const;

describe("command registration", () => {
  it("registers scoped commands", () => {
    const registerCommand = vi.fn();
    createSkillControllerExtension({ registerCommand } as never);

    expect(registerCommand).toHaveBeenCalledTimes(2);
    expect(registerCommand.mock.calls[0]?.[0]).toBe("sc:global");
    expect(registerCommand.mock.calls[1]?.[0]).toBe("sc:project");
  });

  it("formats save and cancel copy with exact file path context", () => {
    expect(
      formatSaveMessage({
        scope: "project",
        saved: true,
        settingsPath: "/tmp/repo/.pi/settings.json",
        createdSettingsFile: true,
        changedSkills: [
          {
            name: "gizmo",
            enabled: false,
            filePath: "/tmp/repo/.pi/settings.json",
            createdSettingsFile: true,
          },
        ],
      }),
    ).toContain("/tmp/repo/.pi/settings.json");

    expect(formatCancelMessage("global", "/tmp/home/.pi/agent/settings.json")).toContain(
      "/tmp/home/.pi/agent/settings.json",
    );
  });

  it("formats malformed json failure copy with exact file path context", () => {
    expect(
      formatCommandError(
        "global",
        "/tmp/home/.pi/agent/settings.json",
        new Error("Malformed JSON in /tmp/home/.pi/agent/settings.json: Expected property name"),
      ),
    ).toContain("/tmp/home/.pi/agent/settings.json");
  });
});

describe("overlay interaction contract", () => {
  function createSkill(id = "skill-1"): SkillRecord {
    return {
      id,
      name: "gizmo",
      skillPath: "/tmp/home/.pi/agent/skills/gizmo/SKILL.md",
      skillDirPath: "/tmp/home/.pi/agent/skills/gizmo",
      relativeSkillPath: "skills/gizmo",
      relativeSkillDirPath: "skills/gizmo",
      sourceKind: "auto",
      sourceLabel: "~/.pi/agent/skills",
      sourcePath: "/tmp/home/.pi/agent/skills",
      ownerScope: "global",
      targetScope: "global",
      targetSettingsPath: "/tmp/home/.pi/agent/settings.json",
      enabled: true,
    };
  }

  it("renders exact target settings path in overlay", () => {
    const results: SkillControllerUISelection[] = [];
    const overlay = new SkillControllerOverlay(
      theme as never,
      "global",
      [createSkill()],
      "",
      "/tmp/home/.pi/agent/settings.json",
      (result) => results.push(result),
    );

    const rendered = overlay.render(120).join("\n");

    expect(rendered).toContain("Target file: /tmp/home/.pi/agent/settings.json");
    expect(results).toEqual([]);
  });

  it("returns save payload after enter toggle then ctrl+s", () => {
    const results: SkillControllerUISelection[] = [];
    const overlay = new SkillControllerOverlay(
      theme as never,
      "global",
      [createSkill()],
      "",
      "/tmp/home/.pi/agent/settings.json",
      (result) => results.push(result),
    );

    overlay.handleInput("\r");
    overlay.handleInput("\u0013");

    expect(results).toEqual([
      {
        type: "save",
        changes: [{ skillId: "skill-1", enabled: false }],
      },
    ]);
  });

  it("returns cancel payload on escape without writes", () => {
    const results: SkillControllerUISelection[] = [];
    const overlay = new SkillControllerOverlay(
      theme as never,
      "project",
      [createSkill("skill-2")],
      "",
      "/tmp/repo/.pi/settings.json",
      (result) => results.push(result),
    );

    overlay.handleInput("\u001b");

    expect(results).toEqual([{ type: "cancel", changes: [] }]);
  });
});

describe("command handler copy", () => {
  it("reports cancel with exact target file path", async () => {
    const registerCommand = vi.fn();
    registerScopedSkillControlCommand({ registerCommand } as never, "project");
    const handler = registerCommand.mock.calls[0]?.[1]?.handler as (args: string, ctx: any) => Promise<void>;

    const notify = vi.fn();
    await handler("", {
      cwd: "/tmp/repo",
      ui: {
        custom: vi.fn(async () => ({ type: "cancel", changes: [] })),
        notify,
      },
    });

    expect(notify).toHaveBeenCalledWith(
      "Cancelled project skill changes. No files written to /tmp/repo/.pi/settings.json.",
      "info",
    );
  });

  it("reports malformed settings json with exact target file path", async () => {
    const fixture = createFixtureRoot();
    writeSkill(path.join(fixture.homeDir, ".pi", "agent", "skills", "alpha"), "alpha");
    const settingsPath = path.join(fixture.homeDir, ".pi", "agent", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, "{not-json}\n", "utf8");

    const registerCommand = vi.fn();
    registerScopedSkillControlCommand({ registerCommand } as never, "global", { homeDir: fixture.homeDir });
    const handler = registerCommand.mock.calls[0]?.[1]?.handler as (args: string, ctx: any) => Promise<void>;

    const notify = vi.fn();
    await handler("", {
      cwd: fixture.repoDir,
      ui: {
        custom: vi.fn(async () => ({ type: "save", changes: [] })),
        notify,
      },
    });

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining(`Failed global skill update for ${settingsPath}. Malformed JSON in ${settingsPath}`),
      "error",
    );
  });
});
