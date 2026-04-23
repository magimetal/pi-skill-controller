import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { discoverSkillsForScope } from "./discovery.js";
import { getDefaultSettingsPath, loadScopeSettings, saveSkillChanges } from "./settings-store.js";
import { openSkillControllerOverlay } from "./ui.js";
import type { SaveSummary, Scope, SkillControllerDependencies } from "./types.js";

function formatSaveMessage(summary: SaveSummary): string {
  const changes = summary.changedSkills
    .map((skill) => `${skill.name}=${skill.enabled ? "enabled" : "disabled"}`)
    .join(", ");
  const createdNote = summary.createdSettingsFile ? " Created settings file." : "";
  return `Saved ${summary.scope} skill changes in ${summary.settingsPath}. ${changes}.${createdNote}`;
}

export function formatCancelMessage(scope: Scope, targetSettingsPath: string): string {
  return `Cancelled ${scope} skill changes. No files written to ${targetSettingsPath}.`;
}

export function formatCommandError(scope: Scope, targetSettingsPath: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Failed ${scope} skill update for ${targetSettingsPath}. ${message}`;
}

export function registerScopedSkillControlCommand(
  pi: Pick<ExtensionAPI, "registerCommand">,
  scope: Scope,
  deps: SkillControllerDependencies = {},
): void {
  const name = scope === "global" ? "sc:global" : "sc:project";
  const description =
    scope === "global"
      ? "Enable or disable skills in ~/.pi/agent/settings.json"
      : "Enable or disable skills in .pi/settings.json";

  pi.registerCommand(name, {
    description,
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const homeDir = deps.homeDir ?? process.env.HOME ?? "";
      const targetSettingsPath = getDefaultSettingsPath(scope, ctx.cwd, homeDir);

      try {
        const skills = discoverSkillsForScope(scope, { ...deps, cwd: ctx.cwd }).skills;
        const selection = await openSkillControllerOverlay(ctx, scope, skills, args, targetSettingsPath);
        if (!selection || typeof selection !== "object") {
          ctx.ui.notify(`Interactive overlay unavailable for ${scope} skill control in current mode.`, "error");
          return;
        }
        if (selection.type === "cancel") {
          ctx.ui.notify(formatCancelMessage(scope, targetSettingsPath), "info");
          return;
        }
        const scopeSettings = loadScopeSettings(scope, ctx.cwd, homeDir, deps);
        const summary = saveSkillChanges(scope, scopeSettings, skills, selection.changes, { ...deps, cwd: ctx.cwd });
        ctx.ui.notify(formatSaveMessage(summary), "info");
      } catch (error) {
        ctx.ui.notify(formatCommandError(scope, targetSettingsPath, error), "error");
      }
    },
  });
}

export { formatSaveMessage };
