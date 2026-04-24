import path from "node:path";
import { getPackageEntryIdentity } from "./package-source.js";
import type {
  PackageReference,
  ScopeSettings,
  SettingsData,
  SettingsPackageEntry,
  SettingsPackageFilterEntry,
  SkillRecord,
} from "./types.js";

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

function isPrefixed(entry: string): boolean {
  return entry.startsWith("+") || entry.startsWith("-") || entry.startsWith("!");
}

function normalizeSlashes(value: string): string {
  return value.split(path.sep).join("/");
}

function matchesLiteralSelector(selector: string, relativePath: string): boolean {
  const normalizedSelector = normalizeSlashes(selector);
  const normalizedPath = normalizeSlashes(relativePath);
  return (
    normalizedPath === normalizedSelector || normalizedPath.startsWith(`${normalizedSelector}/`)
  );
}

export function normalizeExactPath(baseDir: string, filePath: string): string {
  const relativePath = path.relative(baseDir, filePath);
  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return normalizeSlashes(relativePath || path.basename(filePath));
  }
  return normalizeSlashes(path.resolve(filePath));
}

export function evaluateExactPathEntries(
  entries: string[] | undefined,
  relativePath: string,
  defaultIncluded: boolean,
): boolean {
  if (!entries) return defaultIncluded;

  const positiveEntries = entries.filter((entry) => !entry.startsWith("-") && !entry.startsWith("!"));
  let included = positiveEntries.length === 0 ? defaultIncluded : false;

  for (const entry of entries) {
    if (entry.startsWith("-")) {
      if (matchesLiteralSelector(entry.slice(1), relativePath)) {
        included = false;
      }
      continue;
    }
    if (entry.startsWith("!")) {
      if (matchesLiteralSelector(entry.slice(1), relativePath)) {
        included = false;
      }
      continue;
    }
    const literal = entry.startsWith("+") ? entry.slice(1) : entry;
    if (matchesLiteralSelector(literal, relativePath)) {
      included = true;
    }
  }

  return included;
}

export function ensureTopLevelSkillState(
  settings: SettingsData,
  relativeSkillDirPath: string,
  enabled: boolean,
): void {
  const skills = [...(settings.skills ?? [])];
  const negativeEntry = `-${relativeSkillDirPath}`;
  const positiveEntry = `+${relativeSkillDirPath}`;
  const filtered = skills.filter(
    (entry) => entry !== negativeEntry && entry !== positiveEntry,
  );

  const hasPositiveSelectors = filtered.some((entry) => !entry.startsWith("-") && !entry.startsWith("!"));

  if (!enabled) {
    filtered.push(negativeEntry);
  } else if (hasPositiveSelectors && !filtered.some((entry) => matchesLiteralSelector(isPrefixed(entry) ? entry.slice(1) : entry, relativeSkillDirPath))) {
    filtered.push(positiveEntry);
  }

  const nextSkills = dedupe(filtered);
  if (nextSkills.length === 0) {
    delete settings.skills;
    return;
  }

  settings.skills = nextSkills;
}

function getPackageSource(entry: SettingsPackageEntry): string {
  return typeof entry === "string" ? entry : entry.source;
}

function toObjectEntry(entry: SettingsPackageEntry): SettingsPackageFilterEntry {
  return typeof entry === "string" ? { source: entry } : { ...entry };
}

export function updatePackageSkillState(
  packages: SettingsPackageEntry[],
  packageIdentity: string,
  settingsBaseDir: string,
  settingsHomeDir: string,
  relativeSkillDirPath: string,
  enabled: boolean,
  fallbackSource: string,
  carryForward?: Pick<SettingsPackageFilterEntry, "extensions" | "prompts" | "themes">,
): SettingsPackageEntry[] {
  const nextPackages = [...packages];
  const index = nextPackages.findIndex(
    (entry) => getPackageEntryIdentity(entry, settingsBaseDir, settingsHomeDir) === packageIdentity,
  );
  const current = index >= 0 ? toObjectEntry(nextPackages[index]!) : { source: fallbackSource };

  if (carryForward?.extensions && current.extensions === undefined) current.extensions = [...carryForward.extensions];
  if (carryForward?.prompts && current.prompts === undefined) current.prompts = [...carryForward.prompts];
  if (carryForward?.themes && current.themes === undefined) current.themes = [...carryForward.themes];

  const skills = [...(current.skills ?? [])];
  const negativeEntry = `-${relativeSkillDirPath}`;
  const positiveEntry = `+${relativeSkillDirPath}`;
  const filtered = skills.filter((entry) => entry !== negativeEntry && entry !== positiveEntry);
  const hasPositiveSelectors = filtered.some((entry) => !entry.startsWith("-") && !entry.startsWith("!"));

  if (!enabled) {
    filtered.push(negativeEntry);
  } else if (hasPositiveSelectors && !filtered.some((entry) => matchesLiteralSelector(isPrefixed(entry) ? entry.slice(1) : entry, relativeSkillDirPath))) {
    filtered.push(positiveEntry);
  }

  const nextSkills = dedupe(filtered);
  if (nextSkills.length === 0) {
    delete current.skills;
  } else {
    current.skills = nextSkills;
  }

  const hasFilters = current.extensions || current.prompts || current.themes || current.skills;
  if (!hasFilters) {
    if (index >= 0) {
      nextPackages[index] = getPackageSource(current);
      return nextPackages;
    }
    return nextPackages;
  }

  if (index >= 0) {
    nextPackages[index] = current;
  } else {
    nextPackages.push(current);
  }

  return nextPackages;
}

export function normalizePackageSourceForScope(
  packageRef: PackageReference,
  targetScope: ScopeSettings,
): string {
  if (!packageRef.packageRoot) return packageRef.source;
  const relativeToTarget = path.relative(targetScope.baseDir, packageRef.packageRoot);
  if (!relativeToTarget.startsWith("..") && !path.isAbsolute(relativeToTarget)) {
    return normalizeSlashes(relativeToTarget || ".");
  }
  return normalizeSlashes(packageRef.packageRoot);
}

export function applySkillEnabledState(
  settings: ScopeSettings,
  skill: SkillRecord,
  enabled: boolean,
  inheritedPackageRef?: PackageReference,
): void {
  if (skill.packageRef || inheritedPackageRef) {
    const packageRef = skill.packageRef ?? inheritedPackageRef;
    if (!packageRef) throw new Error(`Missing package reference for ${skill.name}`);
    settings.data.packages = updatePackageSkillState(
      settings.data.packages ?? [],
      packageRef.identity,
      settings.baseDir,
      settings.homeDir,
      skill.relativeSkillDirPath,
      enabled,
      normalizePackageSourceForScope(packageRef, settings),
      inheritedPackageRef?.nonSkillFilters,
    );
    return;
  }

  ensureTopLevelSkillState(settings.data, skill.relativeSkillDirPath, enabled);
}
