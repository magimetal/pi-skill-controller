# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
