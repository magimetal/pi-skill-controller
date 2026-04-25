<!--THIS IS A GENERATED FILE - DO NOT MODIFY DIRECTLY, FOR MANUAL ADJUSTMENTS UPDATE `AGENTS_CUSTOM.MD`-->
# ALWAYS READ THESE FILE(S)
- @../../AGENTS.md
- @AGENTS_CUSTOM.md

# PROJECT KNOWLEDGE BASE: extensions/skill-controller

## OVERVIEW
Core implementation for scoped Pi skill control: command registration, skill discovery, settings serialization, package-source resolution, and overlay UI.

## STRUCTURE
```text
extensions/skill-controller/
├── commands.ts                         # command handlers and transcript copy
├── create-skill-controller-extension.ts # extension bootstrap
├── discovery.ts                        # skill source aggregation
├── package-source.ts                   # npm/git/local package identity/root resolution
├── path-utils.ts                       # ~ expansion and settings-relative resolution
├── serialization.ts                    # enable/disable filter mutation
├── settings-store.ts                   # load/write scoped JSON settings
├── types.ts                            # shared contracts
└── ui.ts                               # TUI overlay component
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add command behavior | `commands.ts` | Keep registration count exactly two unless PRD changes. |
| Change discovery roots | `discovery.ts` | Covers global/project packages, top-level skills, auto roots. |
| Change JSON writes | `settings-store.ts` | Uses dependency injection for tests. |
| Change selector math | `serialization.ts` | Handles `+path` / `-path` exact entries. |
| Change package resolution | `package-source.ts` | Supports npm cache lookup, git source parse, local paths. |
| Change overlay rendering | `ui.ts` | Keyboard state stays in memory until save. |
| Add/alter contracts | `types.ts` | Check tests and all module imports. |

## CONVENTIONS
- Internal imports must include `.js` suffix for ESM output compatibility.
- Keep filesystem/process calls behind `SkillControllerDependencies` when behavior needs tests.
- `ScopeSettings.baseDir` is settings file directory, not repo root.
- `targetSettingsPath` is carried into `SkillRecord` and UI copy; keep exact path intact.
- Package-managed skill toggles must preserve package identity and inherited non-skill filters.

## ANTI-PATTERNS
- No `as any`, `@ts-ignore`, or swallowed filesystem/JSON errors.
- No broad path-glob matching for skill toggles; current serializer is exact path oriented.
- No write from `discoverSkillsForScope`; discovery is read-only.
- No direct `process.env.HOME` reads outside command/default loading boundary unless injectable.
- No overlay save side effect from `Enter`, arrows, typing, or `Esc`.

## VERIFICATION
```bash
npm run typecheck
npm test
```

## NOTES
- `collectSkillDirs` treats either a directory with `SKILL.md` or loose `.md` file as one skill source.
- Project `.agents/skills` roots walk from `cwd` up to git root; global `.agents/skills` uses home root.
