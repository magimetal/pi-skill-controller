import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, matchesKey, visibleWidth, type Component, type Focusable } from "@mariozechner/pi-tui";
import type { Scope, SkillControllerUISelection, SkillRecord, ToggleChange } from "./types.js";

function chunkText(value: string, width: number): string[] {
  if (width <= 0) return [value];
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += width) {
    chunks.push(value.slice(index, index + width));
  }
  return chunks.length > 0 ? chunks : [""];
}

function padRight(value: string, width: number): string {
  return value + " ".repeat(Math.max(0, width - visibleWidth(value)));
}

function truncate(value: string, width: number): string {
  if (visibleWidth(value) <= width) return value;
  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

export class SkillControllerOverlay implements Component, Focusable {
  focused = false;
  private selectedIndex = 0;
  private query = "";
  private pending = new Map<string, boolean>();

  constructor(
    private readonly theme: Theme,
    private readonly scope: Scope,
    private readonly skills: SkillRecord[],
    initialQuery: string,
    private readonly targetSettingsPath: string,
    private readonly done: (result: SkillControllerUISelection) => void,
  ) {
    this.query = initialQuery;
  }

  private get filteredSkills(): SkillRecord[] {
    const query = this.query.trim().toLowerCase();
    if (!query) return this.skills;
    return this.skills.filter((skill) => {
      const haystack = [skill.name, skill.sourceLabel, skill.relativeSkillDirPath, skill.sourcePath]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  private getCurrentSkill(): SkillRecord | undefined {
    return this.filteredSkills[this.selectedIndex];
  }

  private getEnabled(skill: SkillRecord): boolean {
    return this.pending.get(skill.id) ?? skill.enabled;
  }

  private toggleCurrent(): void {
    const skill = this.getCurrentSkill();
    if (!skill) return;
    this.pending.set(skill.id, !this.getEnabled(skill));
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.done({ type: "cancel", changes: [] });
      return;
    }
    if (matchesKey(data, "ctrl+s")) {
      const changes: ToggleChange[] = Array.from(this.pending.entries()).map(([skillId, enabled]) => ({
        skillId,
        enabled,
      }));
      this.done({ type: "save", changes });
      return;
    }
    if (matchesKey(data, "enter")) {
      this.toggleCurrent();
      return;
    }
    if (matchesKey(data, "up")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      return;
    }
    if (matchesKey(data, "down")) {
      this.selectedIndex = Math.min(Math.max(0, this.filteredSkills.length - 1), this.selectedIndex + 1);
      return;
    }
    if (matchesKey(data, "backspace")) {
      this.query = this.query.slice(0, -1);
      this.selectedIndex = 0;
      return;
    }
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.query += data;
      this.selectedIndex = 0;
    }
  }

  render(width: number): string[] {
    const w = Math.min(100, Math.max(72, width - 6));
    const inner = w - 2;
    const rows: string[] = [];
    const queryLine = `${this.theme.fg("accent", "Search")}: ${this.query}${this.focused ? CURSOR_MARKER : ""}`;
    const title = this.scope === "global" ? "/sc:global" : "/sc:project";
    const filtered = this.filteredSkills;
    const windowRows = filtered.slice(Math.max(0, this.selectedIndex - 5), Math.max(0, this.selectedIndex - 5) + 10);
    const startIndex = filtered.indexOf(windowRows[0] ?? filtered[0]!);

    const wrap = (content: string) =>
      `${this.theme.fg("border", "│")}${padRight(truncate(content, inner), inner)}${this.theme.fg("border", "│")}`;

    rows.push(this.theme.fg("border", `╭${"─".repeat(inner)}╮`));
    rows.push(wrap(` ${this.theme.bold(title)} · interactive skill control`));
    rows.push(wrap(` Scope: ${this.scope} · Enter toggle · Ctrl+S save · Esc cancel`));
    rows.push(wrap(""));
    for (const [index, chunk] of chunkText(`Target file: ${this.targetSettingsPath}`, inner - 1).entries()) {
      rows.push(wrap(` ${index === 0 ? chunk : `  ${chunk}`}`));
    }
    rows.push(wrap(""));
    rows.push(wrap(` ${queryLine}`));
    rows.push(wrap(""));

    if (filtered.length === 0) {
      rows.push(wrap(` ${this.theme.fg("warning", "No skills match current filter")}`));
    } else {
      for (let i = 0; i < windowRows.length; i++) {
        const skill = windowRows[i]!;
        const index = startIndex + i;
        const selected = index === this.selectedIndex;
        const state = this.getEnabled(skill) ? this.theme.fg("success", "enabled") : this.theme.fg("error", "disabled");
        const marker = selected ? this.theme.fg("accent", "▶") : " ";
        const label = `${marker} ${skill.name} · ${state} · ${skill.sourceLabel}`;
        rows.push(wrap(label));
        rows.push(wrap(`   ${truncate(skill.relativeSkillDirPath, inner - 3)}`));
      }
    }

    rows.push(wrap(""));
    rows.push(wrap(` Unsaved changes: ${this.pending.size} · target file writes only on Ctrl+S`));
    rows.push(this.theme.fg("border", `╰${"─".repeat(inner)}╯`));
    return rows;
  }

  invalidate(): void {}
  dispose(): void {}
}

export async function openSkillControllerOverlay(
  ctx: ExtensionCommandContext,
  scope: Scope,
  skills: SkillRecord[],
  args: string,
  targetSettingsPath: string,
): Promise<SkillControllerUISelection> {
  return ctx.ui.custom<SkillControllerUISelection>(
    (_tui, theme, _kb, done) => new SkillControllerOverlay(theme, scope, skills, args.trim(), targetSettingsPath, done),
    { overlay: true },
  );
}
