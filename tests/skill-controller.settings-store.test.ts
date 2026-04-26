import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSkillsForScope } from "../extensions/skill-controller/discovery.js";
import { loadScopeSettings, saveSkillChanges } from "../extensions/skill-controller/settings-store.js";
import { createFixtureRoot, writeJson, writePackage, writeSkill } from "./test-support/skill-controller-fixtures.js";

describe("settings store", () => {
  it("creates project settings on first save only", () => {
    const fixture = createFixtureRoot();
    writeSkill(path.join(fixture.repoDir, ".pi", "skills", "project-skill"), "project-skill");

    const discovery = discoverSkillsForScope("project", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    const skill = discovery.skills.find((entry) => entry.name === "project-skill");
    expect(skill).toBeDefined();

    const settingsPath = path.join(fixture.repoDir, ".pi", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(false);

    const summary = saveSkillChanges(
      "project",
      discovery.project,
      discovery.skills,
      [{ skillId: skill!.id, enabled: false }],
    );

    expect(summary.createdSettingsFile).toBe(true);
    expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toEqual({
      skills: ["-skills/project-skill"],
    });
  });

  it("preserves unrelated settings keys and package filters", () => {
    const fixture = createFixtureRoot();
    const settingsPath = path.join(fixture.homeDir, ".pi", "agent", "settings.json");
    writeSkill(path.join(fixture.homeDir, ".pi", "agent", "skills", "alpha"), "alpha");
    writeJson(settingsPath, {
      theme: "dark",
      packages: [
        {
          source: "npm:other-package",
          extensions: ["extensions/foo.ts"],
        },
      ],
    });

    const discovery = discoverSkillsForScope("global", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    const skill = discovery.skills.find((entry) => entry.name === "alpha");
    saveSkillChanges("global", discovery.global, discovery.skills, [{ skillId: skill!.id, enabled: false }]);

    expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toEqual({
      theme: "dark",
      packages: [
        {
          source: "npm:other-package",
          extensions: ["extensions/foo.ts"],
        },
      ],
      skills: ["-skills/alpha"],
    });
  });

  it("normalizes local package identity for project overrides and preserves non-skill filters", () => {
    const fixture = createFixtureRoot();
    const packageDir = path.join(fixture.homeDir, ".pi", "agent", "packages", "fixture-package");
    writePackage(packageDir, ["packaged-skill"]);
    writeJson(path.join(fixture.homeDir, ".pi", "agent", "settings.json"), {
      packages: [
        {
          source: "./packages/fixture-package",
          extensions: ["extensions/main.ts"],
          prompts: ["prompts/review.md"],
          themes: ["themes/default.json"],
        },
      ],
    });

    const discovery = discoverSkillsForScope("project", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    const skill = discovery.skills.find((entry) => entry.name === "packaged-skill");
    const summary = saveSkillChanges(
      "project",
      discovery.project,
      discovery.skills,
      [{ skillId: skill!.id, enabled: false }],
    );

    const projectSettingsPath = path.join(fixture.repoDir, ".pi", "settings.json");
    const projectSettings = JSON.parse(fs.readFileSync(projectSettingsPath, "utf8"));
    expect(summary.createdSettingsFile).toBe(true);
    expect(projectSettings.packages).toEqual([
      {
        source: path.join(fixture.homeDir, ".pi", "agent", "packages", "fixture-package").split(path.sep).join("/"),
        extensions: ["extensions/main.ts"],
        prompts: ["prompts/review.md"],
        themes: ["themes/default.json"],
        skills: ["-skills/packaged-skill"],
      },
    ]);
  });

  it("writes a project enable override for a globally disabled package skill when project settings is empty", () => {
    const fixture = createFixtureRoot();
    const packageDir = path.join(fixture.homeDir, ".pi", "agent", "packages", "fixture-package");
    const projectSettingsPath = path.join(fixture.repoDir, ".pi", "settings.json");

    writePackage(packageDir, ["packaged-skill"]);
    writeJson(path.join(fixture.homeDir, ".pi", "agent", "settings.json"), {
      packages: [
        {
          source: "./packages/fixture-package",
          skills: ["-skills/packaged-skill"],
        },
      ],
    });
    writeJson(projectSettingsPath, {});

    const discovery = discoverSkillsForScope("project", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    const skill = discovery.skills.find((entry) => entry.name === "packaged-skill");
    expect(skill?.enabled).toBe(false);

    const summary = saveSkillChanges(
      "project",
      discovery.project,
      discovery.skills,
      [{ skillId: skill!.id, enabled: true }],
    );

    expect(summary.createdSettingsFile).toBe(false);
    expect(JSON.parse(fs.readFileSync(projectSettingsPath, "utf8"))).toEqual({
      packages: [
        {
          source: path.join(fixture.homeDir, ".pi", "agent", "packages", "fixture-package").split(path.sep).join("/"),
          skills: ["+skills/packaged-skill"],
        },
      ],
    });
  });

  it("removes package skills key after disable then re-enable in same scope", () => {
    const fixture = createFixtureRoot();
    const packageDir = path.join(fixture.homeDir, ".pi", "agent", "packages", "fixture-package");
    const settingsPath = path.join(fixture.homeDir, ".pi", "agent", "settings.json");

    writePackage(packageDir, ["packaged-skill"]);
    writeJson(settingsPath, {
      packages: ["./packages/fixture-package"],
    });

    let discovery = discoverSkillsForScope("global", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    let skill = discovery.skills.find((entry) => entry.name === "packaged-skill");
    saveSkillChanges("global", discovery.global, discovery.skills, [{ skillId: skill!.id, enabled: false }]);

    discovery = discoverSkillsForScope("global", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    skill = discovery.skills.find((entry) => entry.name === "packaged-skill");
    saveSkillChanges("global", discovery.global, discovery.skills, [{ skillId: skill!.id, enabled: true }]);

    expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toEqual({
      packages: ["./packages/fixture-package"],
    });
  });

  it("removes project override skills key after re-enable and keeps inherited non-skill filters", () => {
    const fixture = createFixtureRoot();
    const packageDir = path.join(fixture.homeDir, ".pi", "agent", "packages", "fixture-package");
    const projectSettingsPath = path.join(fixture.repoDir, ".pi", "settings.json");

    writePackage(packageDir, ["packaged-skill"]);
    writeJson(path.join(fixture.homeDir, ".pi", "agent", "settings.json"), {
      packages: [
        {
          source: "./packages/fixture-package",
          extensions: ["extensions/main.ts"],
          prompts: ["prompts/review.md"],
        },
      ],
    });

    let discovery = discoverSkillsForScope("project", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    let skill = discovery.skills.find((entry) => entry.name === "packaged-skill");
    saveSkillChanges("project", discovery.project, discovery.skills, [{ skillId: skill!.id, enabled: false }]);

    discovery = discoverSkillsForScope("project", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    skill = discovery.skills.find((entry) => entry.name === "packaged-skill");
    saveSkillChanges("project", discovery.project, discovery.skills, [{ skillId: skill!.id, enabled: true }]);

    expect(JSON.parse(fs.readFileSync(projectSettingsPath, "utf8"))).toEqual({
      packages: [
        {
          source: path.join(fixture.homeDir, ".pi", "agent", "packages", "fixture-package").split(path.sep).join("/"),
          extensions: ["extensions/main.ts"],
          prompts: ["prompts/review.md"],
        },
      ],
    });
  });

  it("matches scoped npm package identity across versions", () => {
    const fixture = createFixtureRoot();
    const packageDir = path.join(fixture.repoDir, ".pi", "npm", "node_modules", "@org", "pkg");
    const settingsPath = path.join(fixture.repoDir, ".pi", "settings.json");

    writePackage(packageDir, ["npm-packaged-skill"], "@org/pkg");
    writeJson(settingsPath, {
      packages: ["npm:@org/pkg@1.2.3"],
    });

    let discovery = discoverSkillsForScope("project", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    let skill = discovery.skills.find((entry) => entry.name === "npm-packaged-skill");
    saveSkillChanges("project", discovery.project, discovery.skills, [{ skillId: skill!.id, enabled: false }]);

    expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toEqual({
      packages: [
        {
          source: "npm:@org/pkg@1.2.3",
          skills: ["-skills/npm-packaged-skill"],
        },
      ],
    });

    discovery = discoverSkillsForScope("project", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });
    skill = discovery.skills.find((entry) => entry.name === "npm-packaged-skill");
    saveSkillChanges("project", discovery.project, discovery.skills, [{ skillId: skill!.id, enabled: true }]);

    expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toEqual({
      packages: ["npm:@org/pkg@1.2.3"],
    });
  });

  it("rejects malformed settings json", () => {
    const fixture = createFixtureRoot();
    const settingsPath = path.join(fixture.homeDir, ".pi", "agent", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, "{not-json}\n", "utf8");

    expect(() =>
      loadScopeSettings("global", fixture.repoDir, fixture.homeDir),
    ).toThrow(/Malformed JSON/);
  });
});
