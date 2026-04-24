import path from "node:path";

function expandHomePath(value: string, homeDir: string): string {
  if (!homeDir) return value;
  if (value === "~") return homeDir;
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(homeDir, value.slice(2));
  }
  return value;
}

export function expandHomePathSelector(value: string, homeDir: string): string {
  const prefix = value[0];
  if (prefix === "+" || prefix === "-" || prefix === "!") {
    return `${prefix}${expandHomePath(value.slice(1), homeDir)}`;
  }
  return expandHomePath(value, homeDir);
}

export function resolveSettingsPath(baseDir: string, value: string, homeDir: string): string {
  return path.resolve(baseDir, expandHomePath(value, homeDir));
}
