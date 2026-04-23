import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface FixturePaths {
  rootDir: string;
  homeDir: string;
  repoDir: string;
}

export function createFixtureRoot(prefix = "pi-skill-controller-"): FixturePaths {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(rootDir, "home");
  const repoDir = path.join(rootDir, "repo");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });
  return { rootDir, homeDir, repoDir };
}

export function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function writeSkill(skillDir: string, name: string, description = "fixture skill"): void {
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
}

export function writePackage(
  packageDir: string,
  skillNames: string[],
  packageName = "fixture-package",
): void {
  fs.mkdirSync(path.join(packageDir, "skills"), { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version: "0.0.0",
        type: "module",
        keywords: ["pi-package"],
        pi: {
          skills: ["./skills"],
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  for (const skillName of skillNames) {
    writeSkill(path.join(packageDir, "skills", skillName), skillName);
  }
}
