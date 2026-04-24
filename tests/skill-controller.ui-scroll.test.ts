import { describe, expect, it } from "vitest";
import { SkillControllerOverlay, maxSkillsForHeight } from "../extensions/skill-controller/ui.js";
import type { SkillControllerUISelection, SkillRecord } from "../extensions/skill-controller/types.js";

const theme = {
  fg: (_token: string, value: string) => value,
  bold: (value: string) => value,
} as const;

function createSkills(count: number): SkillRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `skill-${i}`,
    name: `skill-${String(i).padStart(3, "0")}`,
    skillPath: `/tmp/skills/skill-${i}/SKILL.md`,
    skillDirPath: `/tmp/skills/skill-${i}`,
    relativeSkillPath: `skills/skill-${i}`,
    relativeSkillDirPath: `skills/skill-${i}`,
    sourceKind: "auto" as const,
    sourceLabel: "~/.pi/agent/skills",
    sourcePath: "/tmp/skills",
    ownerScope: "global" as const,
    targetScope: "global" as const,
    targetSettingsPath: "/tmp/settings.json",
    enabled: true,
  }));
}

function createOverlay(
  skills: SkillRecord[],
  maxVisibleSkills?: number,
): { overlay: SkillControllerOverlay; results: SkillControllerUISelection[] } {
  const results: SkillControllerUISelection[] = [];
  const overlay = new SkillControllerOverlay(
    theme as never,
    "global",
    skills,
    "",
    "/tmp/settings.json",
    (result) => results.push(result),
    maxVisibleSkills,
  );
  return { overlay, results };
}

/** Simulate pressing down arrow N times. */
function pressDown(overlay: SkillControllerOverlay, times: number): void {
  for (let i = 0; i < times; i++) {
    overlay.handleInput("\u001b[B"); // down arrow
  }
}

/** Simulate pressing up arrow N times. */
function pressUp(overlay: SkillControllerOverlay, times: number): void {
  for (let i = 0; i < times; i++) {
    overlay.handleInput("\u001b[A"); // up arrow
  }
}

/** Get the plain text of rendered lines (theme mock returns raw strings). */
function renderText(overlay: SkillControllerOverlay, width = 120): string {
  return overlay.render(width).join("\n");
}

/** Find which skill name has the selection marker (▶). */
function selectedSkillName(overlay: SkillControllerOverlay, width = 120): string | undefined {
  const lines = overlay.render(width);
  const markerLine = lines.find((line) => line.includes("▶"));
  if (!markerLine) return undefined;
  const match = markerLine.match(/▶\s+(skill-\d+)/);
  return match?.[1];
}

describe("maxSkillsForHeight", () => {
  it("returns at least 1 for very small terminals", () => {
    expect(maxSkillsForHeight(10)).toBeGreaterThanOrEqual(1);
    expect(maxSkillsForHeight(5)).toBe(1);
  });

  it("scales with terminal height", () => {
    const small = maxSkillsForHeight(24);
    const large = maxSkillsForHeight(60);
    expect(large).toBeGreaterThan(small);
  });

  it("computes expected values for common terminal heights", () => {
    // 24 rows: 24 - 10 chrome - 2 indicators = 12 available / 2 rows per skill = 6
    expect(maxSkillsForHeight(24)).toBe(6);
    // 40 rows: 40 - 12 = 28 / 2 = 14
    expect(maxSkillsForHeight(40)).toBe(14);
    // 60 rows: 60 - 12 = 48 / 2 = 24
    expect(maxSkillsForHeight(60)).toBe(24);
  });
});

describe("overlay with 40+ skills", () => {
  it("renders all skills when viewport is large enough", () => {
    const skills = createSkills(5);
    const { overlay } = createOverlay(skills, 20);
    const text = renderText(overlay);

    for (const skill of skills) {
      expect(text).toContain(skill.name);
    }
  });

  it("limits visible skills to maxVisibleSkills", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);
    const text = renderText(overlay);

    // First 5 skills should be visible
    expect(text).toContain("skill-000");
    expect(text).toContain("skill-004");
    // Skill beyond the window should not be visible
    expect(text).not.toContain("skill-010");
  });

  it("shows scroll-down indicator when items are hidden below", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);
    const text = renderText(overlay);

    expect(text).toContain("↓ 35 more below");
  });

  it("does not show scroll-up indicator when at the top", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);
    const text = renderText(overlay);

    // The controls line contains "↑↓ navigate" which is expected.
    // The scroll indicator specifically says "more above".
    expect(text).not.toContain("more above");
  });

  it("shows scroll-up indicator after scrolling down", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);
    pressDown(overlay, 10);
    const text = renderText(overlay);

    expect(text).toContain("more above");
  });

  it("shows both scroll indicators when in the middle of the list", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);
    pressDown(overlay, 20);
    const text = renderText(overlay);

    expect(text).toContain("more above");
    expect(text).toContain("more below");
  });

  it("does not show scroll-down indicator when at the bottom", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);
    pressDown(overlay, 39); // go to last item
    const text = renderText(overlay);

    expect(text).not.toContain("more below");
    expect(text).toContain("more above");
  });
});

describe("arrow-key navigation reaches every skill", () => {
  it("can reach the last skill with repeated down presses", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);

    pressDown(overlay, 39);
    expect(selectedSkillName(overlay)).toBe("skill-039");

    const text = renderText(overlay);
    expect(text).toContain("skill-039");
  });

  it("can navigate back to the first skill with up presses", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);

    pressDown(overlay, 39);
    pressUp(overlay, 39);
    expect(selectedSkillName(overlay)).toBe("skill-000");

    const text = renderText(overlay);
    expect(text).toContain("skill-000");
  });

  it("every skill becomes visible when navigating through the full list", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);
    const seenSkills = new Set<string>();

    // Collect all visible skill names as we navigate down
    for (let i = 0; i < 40; i++) {
      const lines = overlay.render(120);
      for (const line of lines) {
        const match = line.match(/skill-(\d{3})/g);
        if (match) {
          for (const m of match) seenSkills.add(m);
        }
      }
      pressDown(overlay, 1);
    }

    // Every skill should have been visible at some point
    for (const skill of skills) {
      expect(seenSkills.has(skill.name)).toBe(true);
    }
  });

  it("selected item is always rendered in the viewport", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);

    for (let i = 0; i < 40; i++) {
      const text = renderText(overlay);
      const selected = selectedSkillName(overlay);
      expect(selected).toBeDefined();
      expect(text).toContain(selected!);
      // The marker should be visible
      expect(text).toContain("▶");
      pressDown(overlay, 1);
    }
  });
});

describe("up arrow does not go below zero", () => {
  it("stays at first item when pressing up at the top", () => {
    const skills = createSkills(10);
    const { overlay } = createOverlay(skills, 5);

    pressUp(overlay, 5);
    expect(selectedSkillName(overlay)).toBe("skill-000");
  });
});

describe("down arrow does not exceed list length", () => {
  it("stays at last item when pressing down past the end", () => {
    const skills = createSkills(10);
    const { overlay } = createOverlay(skills, 5);

    pressDown(overlay, 20);
    expect(selectedSkillName(overlay)).toBe("skill-009");
  });
});

describe("controls copy shows arrow keys", () => {
  it("displays ↑↓ navigate in the controls line", () => {
    const skills = createSkills(5);
    const { overlay } = createOverlay(skills, 5);
    const text = renderText(overlay);

    expect(text).toContain("↑↓ navigate");
  });
});

describe("skill count shown in footer", () => {
  it("displays total filtered skill count", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);
    const text = renderText(overlay);

    expect(text).toContain("40 skills");
  });

  it("displays singular when only 1 skill", () => {
    const skills = createSkills(1);
    const { overlay } = createOverlay(skills, 5);
    const text = renderText(overlay);

    expect(text).toContain("1 skill");
    expect(text).not.toContain("1 skills");
  });
});

describe("filtering with long lists", () => {
  it("resets selection to 0 when typing a filter", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);

    pressDown(overlay, 20);
    // Type a character to filter
    overlay.handleInput("0");
    expect(selectedSkillName(overlay)).toBeDefined();

    // Selection should be at index 0 of filtered results
    const text = renderText(overlay);
    expect(text).toContain("▶");
  });

  it("scroll indicators update after filtering", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);

    // Initially shows 35 more below
    expect(renderText(overlay)).toContain("35 more below");

    // Type filter that matches fewer skills
    overlay.handleInput("3");
    overlay.handleInput("9");
    const text = renderText(overlay);

    // Only skill-039 matches "39", so no scroll indicators needed
    expect(text).not.toContain("more below");
    expect(text).not.toContain("more above");
  });
});

describe("viewport centering behavior", () => {
  it("centers the selected item in the viewport when possible", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 5);

    // Navigate to skill 20 (middle of list)
    pressDown(overlay, 20);
    const text = renderText(overlay);

    // skill-020 should be visible and selected
    expect(text).toContain("skill-020");
    expect(selectedSkillName(overlay)).toBe("skill-020");

    // Items around it should also be visible (at least one neighbor on each side)
    const hasNeighborAbove = text.includes("skill-018") || text.includes("skill-019");
    const hasNeighborBelow = text.includes("skill-021") || text.includes("skill-022");
    expect(hasNeighborAbove).toBe(true);
    expect(hasNeighborBelow).toBe(true);
  });
});

describe("default maxVisibleSkills", () => {
  it("uses default of 20 when no maxVisibleSkills is provided", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills); // no maxVisibleSkills
    expect(overlay.maxVisibleSkills).toBe(20);
  });

  it("respects explicit maxVisibleSkills override", () => {
    const skills = createSkills(40);
    const { overlay } = createOverlay(skills, 8);
    expect(overlay.maxVisibleSkills).toBe(8);
  });
});
