import fs from "node:fs";
import path from "node:path";
import { applySkillEnabledState } from "./serialization.js";
import type {
  PackageReference,
  SaveSummary,
  Scope,
  ScopeSettings,
  SettingsData,
  SkillControllerDependencies,
  SkillRecord,
  ToggleChange,
} from "./types.js";

export function getDefaultSettingsPath(scope: Scope, cwd: string, homeDir: string): string {
  return scope === "global"
    ? path.join(homeDir, ".pi", "agent", "settings.json")
    : path.join(cwd, ".pi", "settings.json");
}

export function loadScopeSettings(
  scope: Scope,
  cwd: string,
  homeDir: string,
  deps: SkillControllerDependencies = {},
): ScopeSettings {
  const readFileSync = deps.readFileSync ?? fs.readFileSync;
  const existsSync = deps.existsSync ?? fs.existsSync;
  const settingsPath = getDefaultSettingsPath(scope, cwd, homeDir);
  const exists = existsSync(settingsPath);
  const raw = exists ? readFileSync(settingsPath, "utf8") : "{}";

  let data: SettingsData;
  try {
    data = JSON.parse(raw) as SettingsData;
  } catch (error) {
    throw new Error(`Malformed JSON in ${settingsPath}: ${(error as Error).message}`);
  }

  return {
    scope,
    settingsPath,
    baseDir: path.dirname(settingsPath),
    homeDir,
    exists,
    data,
  };
}

export function writeScopeSettings(
  scopeSettings: ScopeSettings,
  deps: SkillControllerDependencies = {},
): { createdSettingsFile: boolean } {
  const writeFileSync = deps.writeFileSync ?? fs.writeFileSync;
  const mkdirSync = deps.mkdirSync ?? fs.mkdirSync;
  const existsSync = deps.existsSync ?? fs.existsSync;
  const createdSettingsFile = !existsSync(scopeSettings.settingsPath);
  mkdirSync(scopeSettings.baseDir, { recursive: true });
  writeFileSync(scopeSettings.settingsPath, `${JSON.stringify(scopeSettings.data, null, 2)}\n`, "utf8");
  return { createdSettingsFile };
}

export function saveSkillChanges(
  scope: Scope,
  scopeSettings: ScopeSettings,
  allSkills: SkillRecord[],
  changes: ToggleChange[],
  deps: SkillControllerDependencies = {},
): SaveSummary {
  const changedSkills = allSkills.filter((skill) => changes.some((change) => change.skillId === skill.id));
  const inheritedPackages = new Map<string, PackageReference>();

  if (scope === "project") {
    for (const skill of allSkills) {
      if (skill.ownerScope === "global" && skill.packageRef) {
        inheritedPackages.set(skill.packageRef.identity, skill.packageRef);
      }
    }
  }

  for (const change of changes) {
    const skill = changedSkills.find((entry) => entry.id === change.skillId);
    if (!skill) continue;
    const inheritedPackage = skill.packageRef
      ? inheritedPackages.get(skill.packageRef.identity)
      : undefined;
    applySkillEnabledState(scopeSettings, skill, change.enabled, inheritedPackage);
  }

  const { createdSettingsFile } = writeScopeSettings(scopeSettings, deps);

  return {
    scope,
    saved: true,
    settingsPath: scopeSettings.settingsPath,
    createdSettingsFile,
    changedSkills: changedSkills.map((skill) => ({
      name: skill.name,
      enabled: changes.find((change) => change.skillId === skill.id)?.enabled ?? skill.enabled,
      filePath: scopeSettings.settingsPath,
      createdSettingsFile,
    })),
  };
}
