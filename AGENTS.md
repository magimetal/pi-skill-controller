<!--THIS IS A GENERATED FILE - DO NOT MODIFY DIRECTLY, FOR MANUAL ADJUSTMENTS UPDATE `AGENTS_CUSTOM.MD`-->
# ALWAYS READ THESE FILE(S)
- @AGENTS_CUSTOM.md

# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-25
**Commit:** 35dbff3
**Branch:** main

## OVERVIEW
`pi-skill-controller` is publishable Pi package that registers `/sc:global` and `/sc:project` commands for scoped skill toggling. Stack is TypeScript ESM, Pi extension API, `@mariozechner/pi-tui`, Vitest, and npm package metadata.

## STRUCTURE
```text
pi-skill-controller/
├── extensions/skill-controller.ts          # Pi package extension entrypoint
├── extensions/skill-controller/            # command, discovery, settings mutation, TUI overlay
├── tests/                                  # Vitest coverage with isolated temp HOME/repos
├── docs/prd/                               # completed PRD-0001 + template/index
├── docs/plans/                             # implementation plan history
├── package.json                            # pi.extensions manifest + package scripts
└── vitest.config.ts                        # test include/exclude settings
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Register commands | `extensions/skill-controller/create-skill-controller-extension.ts`, `commands.ts` | Exactly `sc:global` and `sc:project`. |
| Discover skills | `extensions/skill-controller/discovery.ts` | Merges packages, settings, auto roots, `.agents/skills`. |
| Mutate settings | `extensions/skill-controller/settings-store.ts`, `serialization.ts` | Preserve unrelated keys/resource filters. |
| Resolve package roots | `extensions/skill-controller/package-source.ts`, `path-utils.ts` | npm/git/local source identity and paths. |
| Change overlay UI | `extensions/skill-controller/ui.ts` | Pi TUI component; save only on Ctrl+S. |
| Add tests | `tests/*.test.ts`, `tests/test-support/skill-controller-fixtures.ts` | Use temp dirs; never real Pi settings. |
| Product constraints | `docs/prd/0001-pi-skill-controller-package-and-scoped-skill-loading.md` | Completed acceptance criteria and scope. |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `createSkillControllerExtension` | default function | `extensions/skill-controller/create-skill-controller-extension.ts` | Registers both scoped commands. |
| `registerScopedSkillControlCommand` | function | `extensions/skill-controller/commands.ts` | Command handler, overlay dispatch, save/cancel/error copy. |
| `discoverSkillsForScope` | function | `extensions/skill-controller/discovery.ts` | Builds `DiscoveryResult` from global/project sources. |
| `saveSkillChanges` | function | `extensions/skill-controller/settings-store.ts` | Applies toggles and writes JSON settings. |
| `applySkillEnabledState` | function | `extensions/skill-controller/serialization.ts` | Encodes enable/disable into top-level or package filters. |
| `SkillControllerOverlay` | class | `extensions/skill-controller/ui.ts` | Keyboard-driven skill list overlay. |

## CONVENTIONS
- Runtime code is ESM TypeScript; internal imports use `.js` suffix.
- `package.json` `pi.extensions` points at `./extensions/skill-controller.ts`; package `files` allowlists `extensions`, docs, license, changelog.
- Scope names are only `"global" | "project"`; command names derive from scope.
- Global writes target `~/.pi/agent/settings.json`; project writes target `<cwd>/.pi/settings.json`.
- Tests must inject `homeDir`, `cwd`, and filesystem dependencies; avoid ambient user settings.
- User-facing copy includes exact target settings path for save, cancel, and malformed JSON errors.

## ANTI-PATTERNS (THIS PROJECT)
- Do not write settings during overlay navigation or `Enter`; only `Ctrl+S` saves.
- Do not delete unrelated settings keys or non-skill package filters (`extensions`, `prompts`, `themes`).
- Do not invent undocumented Pi settings fields; use existing `skills` arrays and package `skills` filters.
- Do not validate against real `HOME` or real repos; use temp fixture roots.
- Do not hide malformed JSON behind generic errors; include exact settings path.
- Do not create `.pi/settings.json` until project-scope save actually happens.

## UNIQUE STYLES
- Command behavior is safety-copy heavy: every write/cancel/error names scope and file path.
- Package override logic preserves inherited non-skill package filters so project skill overrides do not widen resources.
- Discovery de-duplicates by stable IDs prefixed with `package:`, `settings:`, or `auto:`.

## COMMANDS
```bash
npm install
npm run typecheck
npm test
npm run check
npm pack --dry-run
```

## NOTES
- `node_modules/` may exist locally; ignore it for repo analysis and docs.
- `docs/prd/0001...` is completed; update only if product scope changes materially.
- `README.md` is user-facing package documentation; keep install and safety sections aligned with command behavior.
