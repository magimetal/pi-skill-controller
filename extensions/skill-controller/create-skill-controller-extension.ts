import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerScopedSkillControlCommand } from "./commands.js";
import type { SkillControllerDependencies } from "./types.js";

export default function createSkillControllerExtension(
  pi: ExtensionAPI,
  deps: SkillControllerDependencies = {},
): void {
  registerScopedSkillControlCommand(pi, "global", deps);
  registerScopedSkillControlCommand(pi, "project", deps);
}
