import fs from "node:fs";
import path from "node:path";
import { getPackageIdentity, resolvePackageRoot } from "./package-source.js";
import { evaluateExactPathEntries, normalizeExactPath } from "./serialization.js";
import { loadScopeSettings } from "./settings-store.js";
import type {
  DiscoveryResult,
  PackageReference,
  Scope,
  ScopeSettings,
  SettingsPackageEntry,
  SkillControllerDependencies,
  SkillRecord,
} from "./types.js";

interface FileSystemApi {
  existsSync: typeof fs.existsSync;
  readdirSync: typeof fs.readdirSync;
  statSync: typeof fs.statSync;
  readFileSync: typeof fs.readFileSync;
}

function createFs(deps: SkillControllerDependencies): FileSystemApi {
  return {
    existsSync: deps.existsSync ?? fs.existsSync,
    readdirSync: deps.readdirSync ?? fs.readdirSync,
    statSync: deps.statSync ?? fs.statSync,
    readFileSync: deps.readFileSync ?? fs.readFileSync,
  };
}

function normalizeName(name: string): string {
  return name.replace(/\\/g, "/");
}

function resolveSkillName(skillDirPath: string, fsApi: FileSystemApi): string {
  const skillMdPath = path.join(skillDirPath, "SKILL.md");
  if (fsApi.existsSync(skillMdPath)) {
    const content = fsApi.readFileSync(skillMdPath, "utf8");
    const match = content.match(/^name:\s*([^\n]+)$/m);
    if (match?.[1]) return match[1].trim();
  }
  return path.basename(skillDirPath);
}

function collectSkillDirs(rootPath: string, fsApi: FileSystemApi): string[] {
  if (!fsApi.existsSync(rootPath)) return [];
  const stat = fsApi.statSync(rootPath);
  if (stat.isFile() && rootPath.endsWith(".md")) {
    return [rootPath];
  }
  if (!stat.isDirectory()) return [];

  const results: string[] = [];
  const skillMdPath = path.join(rootPath, "SKILL.md");
  if (fsApi.existsSync(skillMdPath)) {
    results.push(rootPath);
    return results;
  }

  for (const entry of fsApi.readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(entryPath);
      continue;
    }
    if (entry.isDirectory()) {
      results.push(...collectSkillDirs(entryPath, fsApi));
    }
  }

  return results;
}


function packageSkillRoots(packageRoot: string, fsApi: FileSystemApi): string[] {
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (fsApi.existsSync(packageJsonPath)) {
    const raw = fsApi.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { pi?: { skills?: string[] } };
    if (parsed.pi?.skills?.length) {
      return parsed.pi.skills
        .filter((entry) => !entry.includes("*") && !entry.startsWith("!"))
        .map((entry) => path.resolve(packageRoot, entry));
    }
  }
  return [path.join(packageRoot, "skills")];
}

function pushSkill(
  skills: SkillRecord[],
  skill: SkillRecord,
  seen: Set<string>,
): void {
  if (seen.has(skill.id)) return;
  seen.add(skill.id);
  skills.push(skill);
}

function discoverFromTopLevelSkills(
  scopeSettings: ScopeSettings,
  targetScope: Scope,
  fsApi: FileSystemApi,
  skills: SkillRecord[],
  seen: Set<string>,
): void {
  for (const entry of scopeSettings.data.skills ?? []) {
    if (entry.startsWith("+") || entry.startsWith("-") || entry.startsWith("!") || entry.includes("*")) {
      continue;
    }
    const resolved = path.resolve(scopeSettings.baseDir, entry);
    for (const skillPath of collectSkillDirs(resolved, fsApi)) {
      const skillDirPath = skillPath.endsWith(".md") ? skillPath : skillPath;
      const relativeSkillPath = normalizeExactPath(scopeSettings.baseDir, skillDirPath);
      pushSkill(skills, {
        id: `settings:${scopeSettings.scope}:${skillDirPath}`,
        name: resolveSkillName(skillDirPath, fsApi),
        skillPath: skillPath.endsWith(".md") ? skillPath : path.join(skillPath, "SKILL.md"),
        skillDirPath,
        relativeSkillPath,
        relativeSkillDirPath: relativeSkillPath,
        sourceKind: "settings",
        sourceLabel: `${scopeSettings.scope} settings`,
        sourcePath: resolved,
        ownerScope: scopeSettings.scope,
        targetScope,
        targetSettingsPath: targetScope === "global" ? scopeSettings.settingsPath : path.join(path.dirname(scopeSettings.baseDir), ".pi", "settings.json"),
        enabled: evaluateExactPathEntries(scopeSettings.data.skills, relativeSkillPath, true),
      }, seen);
    }
  }
}

function discoverFromAutoRoot(
  autoRoot: string,
  scopeSettings: ScopeSettings,
  targetScope: Scope,
  fsApi: FileSystemApi,
  skills: SkillRecord[],
  seen: Set<string>,
  label: string,
): void {
  for (const skillDirPath of collectSkillDirs(autoRoot, fsApi)) {
    const relativeSkillPath = normalizeExactPath(scopeSettings.baseDir, skillDirPath);
    pushSkill(skills, {
      id: `auto:${scopeSettings.scope}:${skillDirPath}`,
      name: resolveSkillName(skillDirPath, fsApi),
      skillPath: skillDirPath.endsWith(".md") ? skillDirPath : path.join(skillDirPath, "SKILL.md"),
      skillDirPath,
      relativeSkillPath,
      relativeSkillDirPath: relativeSkillPath,
      sourceKind: "auto",
      sourceLabel: label,
      sourcePath: autoRoot,
      ownerScope: scopeSettings.scope,
      targetScope,
      targetSettingsPath: targetScope === "global" ? scopeSettings.settingsPath : path.join(path.dirname(scopeSettings.baseDir), ".pi", "settings.json"),
      enabled: evaluateExactPathEntries(scopeSettings.data.skills, relativeSkillPath, true),
    }, seen);
  }
}

function discoverFromPackages(
  scopeSettings: ScopeSettings,
  targetScope: Scope,
  fsApi: FileSystemApi,
  skills: SkillRecord[],
  seen: Set<string>,
  deps: SkillControllerDependencies,
): void {
  for (const [entryIndex, pkg] of (scopeSettings.data.packages ?? []).entries()) {
    const source = typeof pkg === "string" ? pkg : pkg.source;
    const identity = getPackageIdentity(source, scopeSettings.baseDir);
    const packageRoot = resolvePackageRoot(source, scopeSettings, {
      execFileSync: deps.execFileSync,
      existsSync: fsApi.existsSync,
    });
    if (!packageRoot || !fsApi.existsSync(packageRoot)) continue;
    const packageRef: PackageReference = {
      source,
      identity,
      packageRoot,
      settingsScope: scopeSettings.scope,
      settingsPath: scopeSettings.settingsPath,
      settingsBaseDir: scopeSettings.baseDir,
      entryIndex,
      entry: pkg,
      skillFilters: typeof pkg === "string" ? undefined : pkg.skills,
      nonSkillFilters:
        typeof pkg === "string"
          ? undefined
          : {
              extensions: pkg.extensions,
              prompts: pkg.prompts,
              themes: pkg.themes,
            },
    };

    for (const skillRoot of packageSkillRoots(packageRoot, fsApi)) {
      for (const skillDirPath of collectSkillDirs(skillRoot, fsApi)) {
        const relativeToPackage = normalizeName(path.relative(packageRoot, skillDirPath));
        pushSkill(skills, {
          id: `package:${identity}:${relativeToPackage}`,
          name: resolveSkillName(skillDirPath, fsApi),
          skillPath: skillDirPath.endsWith(".md") ? skillDirPath : path.join(skillDirPath, "SKILL.md"),
          skillDirPath,
          relativeSkillPath: relativeToPackage,
          relativeSkillDirPath: relativeToPackage,
          sourceKind: "package",
          sourceLabel: `package:${path.basename(packageRoot)}`,
          sourcePath: source,
          ownerScope: scopeSettings.scope,
          targetScope,
          targetSettingsPath: targetScope === "global" ? scopeSettings.settingsPath : path.join(path.dirname(scopeSettings.baseDir), ".pi", "settings.json"),
          packageRef,
          enabled: evaluateExactPathEntries(packageRef.skillFilters, relativeToPackage, true),
        }, seen);
      }
    }
  }
}

function findGitRoot(startDir: string, fsApi: FileSystemApi): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fsApi.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function projectAgentsRoots(cwd: string, fsApi: FileSystemApi): string[] {
  const gitRoot = findGitRoot(cwd, fsApi);
  const roots: string[] = [];
  let current = path.resolve(cwd);
  while (true) {
    roots.push(path.join(current, ".agents", "skills"));
    if (gitRoot && current === gitRoot) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return roots;
}

export function discoverSkillsForScope(
  targetScope: Scope,
  deps: SkillControllerDependencies = {},
): DiscoveryResult {
  const cwd = deps.cwd ?? process.cwd();
  const homeDir = deps.homeDir ?? process.env.HOME ?? "";
  const fsApi = createFs(deps);
  const global = loadScopeSettings("global", cwd, homeDir, deps);
  const project = loadScopeSettings("project", cwd, homeDir, deps);
  const skills: SkillRecord[] = [];
  const seen = new Set<string>();

  discoverFromPackages(global, targetScope, fsApi, skills, seen, deps);
  discoverFromTopLevelSkills(global, targetScope, fsApi, skills, seen);
  discoverFromAutoRoot(path.join(homeDir, ".pi", "agent", "skills"), global, targetScope, fsApi, skills, seen, "~/.pi/agent/skills");
  discoverFromAutoRoot(path.join(homeDir, ".agents", "skills"), global, targetScope, fsApi, skills, seen, "~/.agents/skills");

  discoverFromPackages(project, targetScope, fsApi, skills, seen, deps);
  discoverFromTopLevelSkills(project, targetScope, fsApi, skills, seen);
  discoverFromAutoRoot(path.join(cwd, ".pi", "skills"), project, targetScope, fsApi, skills, seen, ".pi/skills");
  for (const agentsRoot of projectAgentsRoots(cwd, fsApi)) {
    discoverFromAutoRoot(agentsRoot, project, targetScope, fsApi, skills, seen, ".agents/skills");
  }

  return { skills, global, project };
}
