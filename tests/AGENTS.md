<!--THIS IS A GENERATED FILE - DO NOT MODIFY DIRECTLY, FOR MANUAL ADJUSTMENTS UPDATE `AGENTS_CUSTOM.MD`-->
# ALWAYS READ THESE FILE(S)
- @../AGENTS.md
- @AGENTS_CUSTOM.md

# PROJECT KNOWLEDGE BASE: tests

## OVERVIEW
Vitest suite for command registration, overlay interaction, skill discovery, settings serialization, and scroll behavior using isolated temp fixtures.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Command and copy coverage | `skill-controller.commands.test.ts` | Registration, save/cancel/error messages, overlay contract. |
| Discovery behavior | `skill-controller.discovery.test.ts` | Packages, auto roots, duplicate identities, scope roots. |
| Settings writes | `skill-controller.settings-store.test.ts` | Preserve unrelated data and project bootstrap. |
| Overlay scrolling | `skill-controller.ui-scroll.test.ts` | Height math and visible window behavior. |
| Fixture helpers | `test-support/skill-controller-fixtures.ts` | Temp repo/home, JSON writer, skill/package writers. |

## CONVENTIONS
- Use `createFixtureRoot()` for temp `homeDir` and `repoDir`; never touch real `~/.pi` or current project `.pi`.
- Build fixture skills with `writeSkill()` so discovery sees realistic `SKILL.md` frontmatter.
- Inject `homeDir`, `cwd`, and filesystem deps into runtime functions instead of mutating process globals.
- Assert exact paths in user-facing messages; this package treats path copy as safety behavior.

## ANTI-PATTERNS
- Do not rely on test ordering or shared temp state.
- Do not use ambient package/user settings for validation.
- Do not loosen assertions around malformed JSON path text, save target path, or command names.
- Do not add browser/UI snapshot dependencies; overlay tests inspect rendered strings and result payloads.

## VERIFICATION
```bash
npm test
npm run typecheck
```

## NOTES
- Tests intentionally model local package and git/npx package source behavior without installing external packages.
- `tests/test-support/` exports helpers; keep helpers small and specific to this repo's Pi settings domain.
