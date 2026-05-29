# Pi 0.75.3 → 0.77.0 Extension Upgrade Plan

## Objective
Update `pi-skill-controller` for Pi `0.77.0` compatibility only where changelog changes affect this extension. The extension registers `/sc:global` and `/sc:project`, discovers skills from settings/packages/auto roots, and rewrites skill enablement filters in Pi settings.

## Evidence Summary

Observed repository surface:
- `package.json` is TypeScript ESM, registers `./extensions/skill-controller.ts`, has peer dependencies on `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` as `*`, and dev dependencies pinned to `0.74.0`.
- `extensions/skill-controller/create-skill-controller-extension.ts` registers commands through Pi extension APIs.
- `extensions/skill-controller/commands.ts` uses `pi.registerCommand(name, { description, handler })`, `ExtensionCommandContext.cwd`, `ctx.ui.notify`, and `ctx.ui.custom`.
- `extensions/skill-controller/discovery.ts` reads `package.json` `pi.skills`, settings `skills`, package entries, auto skill roots, and package roots.
- `extensions/skill-controller/serialization.ts` mutates top-level `skills` and package `skills` arrays using literal path prefix matching.
- `extensions/skill-controller/package-source.ts` identifies npm/git/local package sources, strips git refs for identity/root resolution, and keeps original source strings available for settings writes.
- Tests currently cover commands, discovery, settings-store serialization, and UI scroll/interaction.

Observed changelog relevance from research:
- Pi `0.75.5` fixed package/resource path handling on Windows and glob/pattern resolution, including config pattern matching base directories. Pi settings/package arrays support glob patterns, `!pattern`, `+path`, and `-path`.
- Pi `0.75.5` also reconciles pinned git refs during `pi update`.
- Pi `0.76.0` changed managed npm extension updates to avoid installing/resolving Pi host packages as peer dependencies.
- Pi `0.77.0` added `InputEvent.streamingBehavior`, `--exclude-tools`, `session_shutdown` cleanup, and `getAllTools().promptGuidelines`; these do not affect the current command-only extension surface.

## Risk Priority

1. **High — glob/pattern filters may be misinterpreted or rewritten.**
   - `discovery.ts` ignores top-level settings skill entries containing `*` and package `pi.skills` entries containing `*` or starting `!`.
   - `serialization.ts` evaluates package and top-level skill filters with literal prefix matching only.
   - Impact: `/sc:*` can show wrong enabled state or add redundant/conflicting `+path`/`-path` entries when existing Pi settings use valid glob or negation patterns.
2. **Medium — Windows/package path semantics may drift from Pi `0.75.5`.**
   - Existing code normalizes slashes in several places but path matching is still literal and may not follow Pi’s pattern base-directory semantics.
   - Impact: false enable/disable state or incorrect settings writes on Windows or with package-relative globs.
3. **Low — git ref handling needs regression coverage.**
   - `package-source.ts` strips refs for identity/root resolution and `serialization.ts` should preserve configured source strings when rewriting existing package entries.
   - Impact: pinned git source refs could be accidentally lost if package entry rewrite behavior regresses.
4. **Low — dev dependency version skew.**
   - Runtime peers are already `*`, but dev dependencies and lockfile are behind Pi `0.77.0`.
   - Impact: local typecheck/tests may not exercise `0.77.0` API types.

## Non-Actions for Irrelevant Pi 0.77.0 Changes

Do not implement changes for the following unless later evidence contradicts the extension surface:
- `InputEvent.streamingBehavior`: extension does not use `pi.on("input")`.
- `--exclude-tools`: extension registers commands, not tools.
- `session_shutdown` cleanup: extension does not allocate long-lived session resources.
- `getAllTools().promptGuidelines`: extension does not call `getAllTools()` or provide tools.
- Managed npm peer dependency behavior in `0.76.0`: keep peer dependencies as `*`; no runtime code change required.

## Task 1 — Align settings/package skill filter evaluation with Pi glob semantics

### What
Replace literal-only selector evaluation in `extensions/skill-controller/serialization.ts` with a small filter matcher that supports Pi-valid entries:
- plain positive patterns, including glob patterns such as `skills/*` or `skills/**`;
- `+path` force-enable entries;
- `-path` and `!pattern` disable/exclude entries;
- directory-prefix behavior for literal selectors, preserving current behavior for non-glob paths;
- package-relative and settings-base-relative matching with normalized `/` separators.

The matcher should be used by:
- `evaluateExactPathEntries`;
- `evaluateOverridePathEntries`;
- duplicate/conflict checks in `ensureTopLevelSkillState`;
- duplicate/conflict checks in `updatePackageSkillState`.

### References
- `extensions/skill-controller/serialization.ts`
- `extensions/skill-controller/discovery.ts`
- `extensions/skill-controller/types.ts`
- `tests/skill-controller.settings-store.test.ts`
- `tests/skill-controller.discovery.test.ts`

### Acceptance Criteria
- Existing tests continue to pass.
- A skill matched by a positive glob entry is shown enabled.
- A skill matched by `!` or `-` glob entry is shown disabled.
- Enabling/disabling a skill does not add a redundant `+path` or `-path` when an existing glob/pattern already expresses the requested state.
- Existing literal prefix behavior is preserved for current tests and non-glob settings.
- No `as any`, `@ts-ignore`, or `@ts-expect-error` is introduced.

### Guardrails
- Do not broaden into a settings schema redesign.
- Do not remove support for current literal path selectors.
- Do not rewrite unrelated settings keys or package filters.
- Do not add a large dependency unless native/minimal matching is insufficient and justified.

### Verification
Run during implementation:
```bash
npm test -- tests/skill-controller.settings-store.test.ts tests/skill-controller.discovery.test.ts
npm run typecheck
npm run check
```

## Task 2 — Discover package skills declared through Pi `pi.skills` glob patterns

### What
Update package skill root discovery so package `package.json` entries like `pi.skills: ["skills/*"]` or mixed include/exclude patterns are not ignored. Discovery should enumerate candidate skill directories/files under the package root and include those selected by Pi-style patterns.

Recommended approach:
- Keep current fast path for literal `pi.skills` entries.
- When any package `pi.skills` entry contains glob syntax or starts with `!`, collect candidate skill dirs/files under the package root and filter them through the same matcher from Task 1.
- Preserve fallback to `<packageRoot>/skills` when `pi.skills` is absent.

### References
- `extensions/skill-controller/discovery.ts` (`packageSkillRoots`, `collectSkillDirs`)
- `extensions/skill-controller/serialization.ts` matcher from Task 1
- `tests/skill-controller.discovery.test.ts`
- `tests/test-support/skill-controller-fixtures.ts`

### Acceptance Criteria
- Package skills declared by literal `pi.skills` entries are still discovered.
- Package skills declared by glob `pi.skills` entries are discovered.
- Package skills excluded by `!` patterns are not discovered.
- File-based `.md` skills and directory-based `SKILL.md` skills remain supported.
- Default package root `skills/` behavior remains unchanged when `pi.skills` is absent.

### Guardrails
- Do not scan outside `packageRoot`.
- Do not follow arbitrary symlink trees unless existing behavior already does.
- Keep result IDs and relative paths stable for existing literal cases.

### Verification
Run during implementation:
```bash
npm test -- tests/skill-controller.discovery.test.ts
npm run typecheck
```

## Task 3 — Add regression tests for package filter serialization with glob and git-ref sources

### What
Add tests proving `/sc:*` saves package skill state without corrupting valid Pi package filters or pinned git sources.

Test cases to add:
1. A package entry with `skills: ["skills/*"]` should not receive a redundant `+skills/foo` when enabling an already included skill.
2. A package entry with `skills: ["!skills/private/*"]` disables matching skills in discovery/evaluation.
3. Disabling one skill selected by a broad positive glob adds only the minimal `-skills/foo` override and preserves the glob.
4. A git package source with `@ref` remains unchanged after package skill enable/disable serialization when rewriting an existing entry.

### References
- `extensions/skill-controller/serialization.ts`
- `extensions/skill-controller/package-source.ts`
- `tests/skill-controller.settings-store.test.ts`
- `tests/skill-controller.discovery.test.ts`

### Acceptance Criteria
- Tests fail before the matcher/discovery implementation for the relevant unsupported glob cases.
- Tests pass after Tasks 1 and 2.
- Existing package `extensions`, `prompts`, and `themes` filters are preserved.
- Existing git source strings with refs are preserved when the entry already exists.

### Guardrails
- Do not assert behavior that Pi itself does not document or the changelog research does not support.
- Avoid brittle absolute path expectations except where path preservation is the feature under test.

### Verification
Run during implementation:
```bash
npm test -- tests/skill-controller.settings-store.test.ts tests/skill-controller.discovery.test.ts
```

## Task 4 — Update development dependency pins and lockfile for Pi 0.77.0 validation

### What
Update local development dependencies to exercise Pi `0.77.0` APIs while keeping runtime peer dependencies broad:
- `@earendil-works/pi-coding-agent`: `0.77.0`
- `@earendil-works/pi-tui`: matching version available for the Pi `0.77.0` stack, expected `0.77.0` if published
- lockfile entries for the above packages

Keep `peerDependencies` as `*` unless maintainers decide to declare a minimum supported Pi version.

### References
- `package.json`
- `package-lock.json` if present
- `extensions/skill-controller/create-skill-controller-extension.ts`
- `extensions/skill-controller/commands.ts`
- `extensions/skill-controller/ui.ts`

### Acceptance Criteria
- `package.json` dev dependencies reference Pi `0.77.0`-compatible packages.
- Lockfile is updated consistently by the package manager.
- Typecheck passes against the updated Pi/TUI type surfaces.
- No runtime peer dependency narrowing is introduced without an explicit compatibility decision.

### Guardrails
- Do not vendor Pi packages.
- Do not change command registration API usage unless typecheck proves it is required.
- Do not alter UI behavior as part of the dependency update unless required by Pi/TUI API changes.

### Verification
Run during implementation:
```bash
npm install
npm run typecheck
npm test
npm run check
```

## Task 5 — Final compatibility verification and manual smoke check

### What
After code/tests/dependency updates, verify the extension still behaves correctly under Pi `0.77.0`.

### References
- `package.json`
- `extensions/skill-controller.ts`
- `extensions/skill-controller/create-skill-controller-extension.ts`
- `extensions/skill-controller/commands.ts`
- `extensions/skill-controller/ui.ts`
- `extensions/skill-controller/discovery.ts`
- `extensions/skill-controller/serialization.ts`
- `tests/*.test.ts`

### Acceptance Criteria
- Automated checks pass.
- `/sc:global` and `/sc:project` are registered and usable in a Pi `0.77.0` session.
- Manual fixture/settings smoke test confirms glob-based package and top-level skill filters are displayed with correct enabled state and saved without corrupting unrelated settings.

### Guardrails
- Do not commit generated or local-only settings from manual testing.
- Redact secrets and private package URLs from any captured logs.
- Keep changes scoped to Pi `0.77.0` compatibility.

### Verification
Run during implementation:
```bash
npm run check
```
Manual checks:
1. In a disposable project, configure a package or local skills entry with glob filters.
2. Start Pi `0.77.0` with this extension installed.
3. Run `/sc:global` and `/sc:project`.
4. Confirm skill enabled states match settings patterns.
5. Toggle one skill, save, and inspect the target settings file for minimal, non-destructive edits.

## Implementation Sequence

1. Add failing tests for glob filter evaluation/serialization and package `pi.skills` glob discovery.
2. Implement shared normalized selector/pattern matching in `serialization.ts`.
3. Reuse that matcher in `discovery.ts` for package `pi.skills` pattern-based discovery.
4. Add/adjust git-ref preservation regression coverage.
5. Update Pi/TUI dev dependency pins and lockfile.
6. Run automated verification, then perform the Pi `0.77.0` manual smoke check.

## Open Risks / Unknowns

- Unknown: exact Pi glob matcher implementation details beyond documented support for glob patterns, `!pattern`, `+path`, and `-path`. Use tests around documented examples and keep implementation conservative.
- Unknown: whether `@earendil-works/pi-tui@0.77.0` is published separately; if not, use the version paired with Pi `0.77.0` and document it in the implementation summary.
- Inferred: no command registration or UI API changes are required because the researched `0.77.0` changes target input events, tools, shutdown cleanup, and prompt guidelines rather than extension commands.
