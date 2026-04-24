# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Overlay skill list now adapts to terminal height instead of using a hardcoded 10-skill window, so all skills are reachable without resizing the terminal.
- `↑` and `↓` arrow keys reliably scroll through the full skill list on Mac keyboards; viewport follows the selection.
- Added scroll indicators (`↑ N more above` / `↓ N more below`) so users can see how many items remain off-screen.
- Controls line now shows `↑↓ navigate` to make arrow-key navigation discoverable.
- Footer displays total filtered skill count for orientation in long lists.
- Overlay passes `maxHeight: "90%"` to prevent the panel from exceeding terminal bounds.

### Added

- `maxSkillsForHeight()` helper that computes how many skills fit for a given terminal height.
- Automated test suite (`skill-controller.ui-scroll.test.ts`) covering long-list navigation, scroll indicators, viewport centering, boundary clamping, and filtering behavior with 40+ skills.

### Changed

- Bumped `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui` dev dependencies to `0.69.0` so package validates against Pi's TypeBox 1.x migration and current extension APIs.

## [0.1.0] - 2026-04-22

### Added

- Initial publishable `pi-skill-controller` package baseline at repo root with `pi-package` metadata and extension entrypoint.
- `/sc:global` command for interactive skill enable or disable writes to `~/.pi/agent/settings.json`.
- `/sc:project` command for interactive skill enable or disable writes to project `.pi/settings.json` on explicit save only.
- Project bootstrap flow that creates `.pi/` and `.pi/settings.json` when first project-scope save happens.
- Discovery and persistence logic for auto-discovered skills, settings-listed skills, and package-managed skills.
- Exact `+path` and `-path` serialization for documented Pi settings and package skill filters.
- Local package override normalization so project overrides point at same package identity as global local package source.
- Preservation of unrelated settings keys plus unrelated package `extensions`, `prompts`, and `themes` filters during writes.
- Automated tests covering command registration, skill discovery, settings preservation, project bootstrap, malformed JSON rejection, and package override behavior.
- README install and usage documentation plus CI workflow for package verification.

### References

- PRD-0001: `docs/prd/0001-pi-skill-controller-package-and-scoped-skill-loading.md`
