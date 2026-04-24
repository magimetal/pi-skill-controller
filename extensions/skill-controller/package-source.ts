import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveSettingsPath } from "./path-utils.js";
import type {
  ScopeSettings,
  SettingsData,
  SettingsPackageEntry,
  SkillControllerDependencies,
} from "./types.js";

interface ParsedGitSource {
  host: string;
  repoPath: string;
}

function normalizeSlashes(value: string): string {
  return value.split(path.sep).join("/");
}

function isGitPackageSource(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed || trimmed.startsWith("npm:")) return false;
  if (trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("~")) return false;
  return (
    trimmed.startsWith("git:")
    || /^(https?|ssh|git):\/\//i.test(trimmed)
    || /^git@[^:]+:/.test(trimmed)
  );
}

function splitRefFromGitSource(source: string): string {
  const raw = source.startsWith("git:") ? source.slice(4).trim() : source.trim();
  const scpLikeMatch = raw.match(/^git@([^:]+):(.+)$/);
  if (scpLikeMatch) {
    const pathWithMaybeRef = scpLikeMatch[2] ?? "";
    const refSeparator = pathWithMaybeRef.indexOf("@");
    if (refSeparator < 0) return raw;
    const repoPath = pathWithMaybeRef.slice(0, refSeparator);
    return `git@${scpLikeMatch[1] ?? ""}:${repoPath}`;
  }

  if (raw.includes("://")) {
    try {
      const parsed = new URL(raw);
      const pathWithMaybeRef = parsed.pathname.replace(/^\/+/, "");
      const refSeparator = pathWithMaybeRef.indexOf("@");
      if (refSeparator < 0) return raw;
      parsed.pathname = `/${pathWithMaybeRef.slice(0, refSeparator)}`;
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return raw;
    }
  }

  const slashIndex = raw.indexOf("/");
  if (slashIndex < 0) return raw;
  const host = raw.slice(0, slashIndex);
  const pathWithMaybeRef = raw.slice(slashIndex + 1);
  const refSeparator = pathWithMaybeRef.indexOf("@");
  if (refSeparator < 0) return raw;
  return `${host}/${pathWithMaybeRef.slice(0, refSeparator)}`;
}

export function parseNpmPackageName(source: string): string {
  const spec = source.replace(/^npm:/, "").trim();
  if (!spec) return spec;
  if (spec.startsWith("@")) {
    const secondAt = spec.lastIndexOf("@");
    return secondAt > 0 ? spec.slice(0, secondAt) : spec;
  }
  const versionSeparator = spec.indexOf("@");
  return versionSeparator >= 0 ? spec.slice(0, versionSeparator) : spec;
}

export function parseGitPackageSource(source: string): ParsedGitSource | null {
  if (!isGitPackageSource(source)) return null;

  const withoutRef = splitRefFromGitSource(source);
  const raw = withoutRef.startsWith("git:") ? withoutRef.slice(4).trim() : withoutRef.trim();

  const scpLikeMatch = raw.match(/^git@([^:]+):(.+)$/);
  if (scpLikeMatch) {
    return {
      host: scpLikeMatch[1] ?? "",
      repoPath: (scpLikeMatch[2] ?? "").replace(/\.git$/, "").replace(/^\/+/, ""),
    };
  }

  if (/^(https?|ssh|git):\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return {
        host: parsed.hostname,
        repoPath: parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, ""),
      };
    } catch {
      return null;
    }
  }

  const slashIndex = raw.indexOf("/");
  if (slashIndex < 0) return null;
  const host = raw.slice(0, slashIndex);
  if (!host.includes(".") && host !== "localhost") return null;
  return {
    host,
    repoPath: raw.slice(slashIndex + 1).replace(/\.git$/, "").replace(/^\/+/, ""),
  };
}

export function getPackageIdentity(source: string, settingsBaseDir: string, homeDir = process.env.HOME ?? ""): string {
  if (source.startsWith("npm:")) {
    return `npm:${parseNpmPackageName(source)}`;
  }

  const gitSource = parseGitPackageSource(source);
  if (gitSource) {
    return `git:${gitSource.host}/${gitSource.repoPath}`;
  }

  return `local:${normalizeSlashes(resolveSettingsPath(settingsBaseDir, source, homeDir))}`;
}

export function getPackageEntryIdentity(entry: SettingsPackageEntry, settingsBaseDir: string, homeDir = process.env.HOME ?? ""): string {
  const source = typeof entry === "string" ? entry : entry.source;
  return getPackageIdentity(source, settingsBaseDir, homeDir);
}

function getNpmCommand(settings: SettingsData): { command: string; args: string[] } {
  const configured = settings.npmCommand;
  if (!configured?.length) {
    return { command: "npm", args: [] };
  }

  const [command, ...args] = configured;
  if (!command) {
    return { command: "npm", args: [] };
  }

  return { command, args };
}

function getGlobalNpmRoot(
  scopeSettings: ScopeSettings,
  deps: SkillControllerDependencies,
): string | null {
  const execFileSyncImpl = deps.execFileSync ?? execFileSync;
  const npmCommand = getNpmCommand(scopeSettings.data);

  try {
    const result = execFileSyncImpl(
      npmCommand.command,
      [...npmCommand.args, "root", "-g"],
      {
        cwd: scopeSettings.baseDir,
        encoding: "utf8",
      },
    );
    return result.trim() || null;
  } catch {
    return null;
  }
}

export function resolvePackageRoot(
  source: string,
  scopeSettings: ScopeSettings,
  deps: SkillControllerDependencies = {},
): string | null {
  const existsSync = deps.existsSync ?? fs.existsSync;

  let packageRoot: string | null;
  if (source.startsWith("npm:")) {
    const packageName = parseNpmPackageName(source);
    const installRoot = scopeSettings.scope === "project"
      ? path.join(scopeSettings.baseDir, "npm", "node_modules")
      : getGlobalNpmRoot(scopeSettings, deps);
    packageRoot = installRoot ? path.join(installRoot, ...packageName.split("/")) : null;
  } else {
    const gitSource = parseGitPackageSource(source);
    if (gitSource) {
      packageRoot = path.join(scopeSettings.baseDir, "git", gitSource.host, ...gitSource.repoPath.split("/"));
    } else {
      packageRoot = resolveSettingsPath(scopeSettings.baseDir, source, scopeSettings.homeDir);
    }
  }

  return packageRoot && existsSync(packageRoot) ? packageRoot : null;
}
