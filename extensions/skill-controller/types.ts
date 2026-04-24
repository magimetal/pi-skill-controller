export type SettingsPackageEntry = string | SettingsPackageFilterEntry;

export interface SettingsPackageFilterEntry {
  source: string;
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
}

export interface SettingsData {
  packages?: SettingsPackageEntry[];
  skills?: string[];
  npmCommand?: string[];
  enableSkillCommands?: boolean;
  [key: string]: unknown;
}

export type Scope = "global" | "project";
export type SkillSourceKind = "package" | "settings" | "auto";

export interface ScopeSettings {
  scope: Scope;
  settingsPath: string;
  baseDir: string;
  homeDir: string;
  exists: boolean;
  data: SettingsData;
}

export interface PackageReference {
  source: string;
  identity: string;
  packageRoot: string | null;
  settingsScope: Scope;
  settingsPath: string;
  settingsBaseDir: string;
  entryIndex: number;
  entry: SettingsPackageEntry;
  skillFilters?: string[];
  nonSkillFilters?: Pick<SettingsPackageFilterEntry, "extensions" | "prompts" | "themes">;
}

export interface SkillRecord {
  id: string;
  name: string;
  skillPath: string;
  skillDirPath: string;
  relativeSkillPath: string;
  relativeSkillDirPath: string;
  sourceKind: SkillSourceKind;
  sourceLabel: string;
  sourcePath: string;
  ownerScope: Scope;
  targetScope: Scope;
  targetSettingsPath: string;
  packageRef?: PackageReference;
  enabled: boolean;
}

export interface DiscoveryResult {
  skills: SkillRecord[];
  global: ScopeSettings;
  project: ScopeSettings;
}

export interface ToggleChange {
  skillId: string;
  enabled: boolean;
}

export interface SaveSummary {
  scope: Scope;
  saved: boolean;
  changedSkills: Array<{
    name: string;
    enabled: boolean;
    filePath: string;
    createdSettingsFile?: boolean;
  }>;
  settingsPath: string;
  createdSettingsFile: boolean;
}

export interface SkillControllerUISelection {
  type: "save" | "cancel";
  changes: ToggleChange[];
}

export interface SkillControllerDependencies {
  cwd?: string;
  homeDir?: string;
  execFileSync?: typeof import("node:child_process").execFileSync;
  existsSync?: typeof import("node:fs").existsSync;
  mkdirSync?: typeof import("node:fs").mkdirSync;
  readFileSync?: typeof import("node:fs").readFileSync;
  writeFileSync?: typeof import("node:fs").writeFileSync;
  readdirSync?: typeof import("node:fs").readdirSync;
  statSync?: typeof import("node:fs").statSync;
}

export interface CommandRuntime {
  discoverSkills(scope: Scope): SkillRecord[];
  openSkillController(args: string, skills: SkillRecord[], scope: Scope): Promise<SkillControllerUISelection>;
  saveChanges(scope: Scope, changes: ToggleChange[]): SaveSummary;
}
