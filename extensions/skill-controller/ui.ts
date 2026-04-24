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

/**
 * Number of fixed chrome rows rendered around the skill list:
 * top border, title, controls, blank, target-file (1+ lines), blank,
 * search, blank, [skills], blank, unsaved-changes, bottom border.
 *
 * Minimum is 10 when the target-file path fits on a single line.
 */
const CHROME_ROWS_BASE = 10;

/** Each skill occupies exactly 2 rendered rows (label + path). */
const ROWS_PER_SKILL = 2;

/** Fallback when no height hint is available. */
const DEFAULT_MAX_VISIBLE_SKILLS = 20;

export class SkillControllerOverlay implements Component, Focusable {
  focused = false;
  private selectedIndex = 0;
  private query = "";
  private pending = new Map<string, boolean>();

  /**
   * Maximum number of skills visible in the viewport at once.
   * Exposed so tests can inspect or override it.
   */
  maxVisibleSkills: number;

  constructor(
    private readonly theme: Theme,
    private readonly scope: Scope,
    private readonly skills: SkillRecord[],
    initialQuery: string,
    private readonly targetSettingsPath: string,
    private readonly done: (result: SkillControllerUISelection) => void,
    maxVisibleSkills?: number,
  ) {
    this.query = initialQuery;
    this.maxVisibleSkills = maxVisibleSkills ?? DEFAULT_MAX_VISIBLE_SKILLS;
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

  /**
   * Compute the visible window of skills and the starting index.
   * Keeps the selected item visible and roughly centered when possible.
   */
  private computeWindow(filtered: SkillRecord[]): { windowSkills: SkillRecord[]; startIndex: number } {
    const maxVisible = Math.min(this.maxVisibleSkills, filtered.length);
    if (filtered.length <= maxVisible) {
      return { windowSkills: filtered, startIndex: 0 };
    }

    // Keep selected item visible with some context above and below.
    // Try to center the selection in the window.
    const half = Math.floor(maxVisible / 2);
    let start = this.selectedIndex - half;
    start = Math.max(0, start);
    start = Math.min(filtered.length - maxVisible, start);

    return {
      windowSkills: filtered.slice(start, start + maxVisible),
      startIndex: start,
    };
  }

  render(width: number): string[] {
    const w = Math.min(100, Math.max(72, width - 6));
    const inner = w - 2;
    const rows: string[] = [];
    const queryLine = `${this.theme.fg("accent", "Search")}: ${this.query}${this.focused ? CURSOR_MARKER : ""}`;
    const title = this.scope === "global" ? "/sc:global" : "/sc:project";
    const filtered = this.filteredSkills;
    const { windowSkills, startIndex } = this.computeWindow(filtered);

    const wrap = (content: string) =>
      `${this.theme.fg("border", "│")}${padRight(truncate(content, inner), inner)}${this.theme.fg("border", "│")}`;

    rows.push(this.theme.fg("border", `╭${"─".repeat(inner)}╮`));
    rows.push(wrap(` ${this.theme.bold(title)} · interactive skill control`));
    rows.push(wrap(` Scope: ${this.scope} · ↑↓ navigate · Enter toggle · Ctrl+S save · Esc cancel`));
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
      // Scroll-up indicator
      const hiddenAbove = startIndex;
      if (hiddenAbove > 0) {
        rows.push(wrap(` ${this.theme.fg("accent", `  ↑ ${hiddenAbove} more above`)}`));
      }

      for (let i = 0; i < windowSkills.length; i++) {
        const skill = windowSkills[i]!;
        const absoluteIndex = startIndex + i;
        const selected = absoluteIndex === this.selectedIndex;
        const state = this.getEnabled(skill) ? this.theme.fg("success", "enabled") : this.theme.fg("error", "disabled");
        const marker = selected ? this.theme.fg("accent", "▶") : " ";
        const label = `${marker} ${skill.name} · ${state} · ${skill.sourceLabel}`;
        rows.push(wrap(label));
        rows.push(wrap(`   ${truncate(skill.relativeSkillDirPath, inner - 3)}`));
      }

      // Scroll-down indicator
      const hiddenBelow = filtered.length - (startIndex + windowSkills.length);
      if (hiddenBelow > 0) {
        rows.push(wrap(` ${this.theme.fg("accent", `  ↓ ${hiddenBelow} more below`)}`));
      }
    }

    rows.push(wrap(""));
    rows.push(wrap(` ${filtered.length} skill${filtered.length !== 1 ? "s" : ""} · Unsaved changes: ${this.pending.size} · target file writes only on Ctrl+S`));
    rows.push(this.theme.fg("border", `╰${"─".repeat(inner)}╯`));
    return rows;
  }

  invalidate(): void {}
  dispose(): void {}
}

/**
 * Compute the maximum number of skills that fit in the overlay given a
 * terminal height. Accounts for chrome rows and 2 rows per skill, plus
 * up to 2 scroll-indicator rows.
 */
export function maxSkillsForHeight(terminalHeight: number): number {
  // Reserve chrome rows + 2 possible scroll indicator rows
  const available = terminalHeight - CHROME_ROWS_BASE - 2;
  return Math.max(1, Math.floor(available / ROWS_PER_SKILL));
}

export async function openSkillControllerOverlay(
  ctx: ExtensionCommandContext,
  scope: Scope,
  skills: SkillRecord[],
  args: string,
  targetSettingsPath: string,
): Promise<SkillControllerUISelection> {
  return ctx.ui.custom<SkillControllerUISelection>(
    (_tui, theme, _kb, done) => {
      // Compute height-aware skill limit from terminal dimensions.
      const termHeight = _tui.terminal.rows ?? 40;
      const maxVisible = maxSkillsForHeight(termHeight);
      return new SkillControllerOverlay(theme, scope, skills, args.trim(), targetSettingsPath, done, maxVisible);
    },
    {
      overlay: true,
      overlayOptions: {
        maxHeight: "90%",
      },
    },
  );
}
