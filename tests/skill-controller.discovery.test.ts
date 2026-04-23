import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSkillsForScope } from "../extensions/skill-controller/discovery.js";
import { createFixtureRoot, writeJson, writePackage, writeSkill } from "./test-support/skill-controller-fixtures.js";

describe("skill discovery", () => {
  it("discovers package, top-level settings, and auto-discovered skills", () => {
    const fixture = createFixtureRoot();
    const globalSettingsPath = path.join(fixture.homeDir, ".pi", "agent", "settings.json");
    const globalSkillsDir = path.join(fixture.homeDir, ".pi", "agent", "skills", "global-auto");
    const localSkillsDir = path.join(fixture.repoDir, ".pi-local-skills");
    const packageDir = path.join(fixture.homeDir, ".pi", "agent", "packages", "fixture-package");

    writeSkill(globalSkillsDir, "global-auto");
    writeSkill(path.join(localSkillsDir, "local-skill"), "local-skill");
    writePackage(packageDir, ["packaged-skill"]);
    writeJson(globalSettingsPath, {
      packages: ["./packages/fixture-package"],
      skills: [localSkillsDir],
    });

    const result = discoverSkillsForScope("global", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });

    expect(result.skills.map((skill) => skill.name).sort()).toEqual([
      "global-auto",
      "local-skill",
      "packaged-skill",
    ]);

    const packaged = result.skills.find((skill) => skill.name === "packaged-skill");
    expect(packaged?.sourceKind).toBe("package");
    expect(packaged?.packageRef?.packageRoot).toBe(packageDir);

    const auto = result.skills.find((skill) => skill.name === "global-auto");
    expect(auto?.sourceKind).toBe("auto");
  });

  it("keeps duplicate names distinct with source labels", () => {
    const fixture = createFixtureRoot();
    const packageDir = path.join(fixture.homeDir, ".pi", "agent", "packages", "fixture-package");
    const localSkillsDir = path.join(fixture.repoDir, ".pi", "skills");

    writePackage(packageDir, ["shared-skill"]);
    writeSkill(path.join(localSkillsDir, "shared-skill"), "shared-skill");
    writeJson(path.join(fixture.homeDir, ".pi", "agent", "settings.json"), {
      packages: ["./packages/fixture-package"],
    });

    const result = discoverSkillsForScope("project", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });

    const collisions = result.skills.filter((skill) => skill.name === "shared-skill");
    expect(collisions).toHaveLength(2);
    expect(new Set(collisions.map((skill) => skill.sourceLabel)).size).toBe(2);
  });

  it("discovers project-installed npm and git package skills", () => {
    const fixture = createFixtureRoot();
    const npmPackageDir = path.join(fixture.repoDir, ".pi", "npm", "node_modules", "@scope", "fixture-package");
    const gitPackageDir = path.join(fixture.repoDir, ".pi", "git", "github.com", "team", "fixture-repo");

    writePackage(npmPackageDir, ["npm-skill"], "@scope/fixture-package");
    writePackage(gitPackageDir, ["git-skill"], "fixture-repo");
    writeJson(path.join(fixture.repoDir, ".pi", "settings.json"), {
      packages: [
        "npm:@scope/fixture-package@1.2.3",
        "git:github.com/team/fixture-repo@v1",
      ],
    });

    const result = discoverSkillsForScope("project", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
    });

    expect(result.skills.map((skill) => skill.name)).toEqual(expect.arrayContaining(["npm-skill", "git-skill"]));

    const npmSkill = result.skills.find((skill) => skill.name === "npm-skill");
    expect(npmSkill?.packageRef?.identity).toBe("npm:@scope/fixture-package");
    expect(npmSkill?.packageRef?.packageRoot).toBe(npmPackageDir);

    const gitSkill = result.skills.find((skill) => skill.name === "git-skill");
    expect(gitSkill?.packageRef?.identity).toBe("git:github.com/team/fixture-repo");
    expect(gitSkill?.packageRef?.packageRoot).toBe(gitPackageDir);
  });

  it("discovers globally installed scoped npm package skills", () => {
    const fixture = createFixtureRoot();
    const globalNpmRoot = path.join(fixture.rootDir, "global-npm", "node_modules");
    const packageDir = path.join(globalNpmRoot, "@org", "pkg");

    writePackage(packageDir, ["global-npm-skill"], "@org/pkg");
    writeJson(path.join(fixture.homeDir, ".pi", "agent", "settings.json"), {
      packages: ["npm:@org/pkg"],
    });

    const result = discoverSkillsForScope("global", {
      cwd: fixture.repoDir,
      homeDir: fixture.homeDir,
      execFileSync: ((_: string, __?: readonly string[]) => `${globalNpmRoot}\n`) as typeof import("node:child_process").execFileSync,
    });

    const skill = result.skills.find((entry) => entry.name === "global-npm-skill");
    expect(skill?.packageRef?.identity).toBe("npm:@org/pkg");
    expect(skill?.packageRef?.packageRoot).toBe(packageDir);
  });
});
