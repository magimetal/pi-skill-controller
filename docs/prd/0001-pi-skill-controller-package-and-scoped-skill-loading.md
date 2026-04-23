# PRD-0001: Pi Skill Controller Package and Scoped Skill Loading

- **Status:** Active
- **Date:** 2026-04-22
- **Author:** Magi Metal
- **Related:** `README.md`, `/Users/magimetal/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/packages.md`, `/Users/magimetal/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/settings.md`, example repos `/Users/magimetal/Dev/pi/pi-gizmo` and `/Users/magimetal/Dev/pi/pi-system-prompt`
- **Supersedes:** None

## Problem Statement

`/Users/magimetal/Dev/pi/pi-skill-controller` currently contains only a placeholder `README.md`, but requested work is materially larger than adding one command file. Product surface includes a new installable Pi package, two user-facing commands (`/sc:global` and `/sc:project`), scoped mutation of Pi settings files, project-level bootstrapping of `.pi/settings.json` when missing, package metadata suitable for `pi install`, and end-user documentation plus changelog expectations.

This affects Pi users who want deterministic control over which skills load automatically, especially when some skills should always stay off globally but be enabled for one project, or vice versa. Without a scoped PRD, implementation can drift on critical boundaries: whether control applies to package-managed skills only or all discovered skills, how enable/disable state is represented in documented Pi settings, what command grammar and confirmation UX look like, and what publish-ready package baseline is required for installability.

## User Stories

- As a Pi user, I want `/sc:global` to enable or disable one named skill in `~/.pi/agent/settings.json` so that I can control my default skill loadout across all sessions.
- As a Pi user, I want `/sc:project` to enable or disable one named skill in `.pi/settings.json` so that project-specific skill policy can override my global defaults without manual JSON editing.
- As a Pi user starting from a repo with no `.pi/settings.json`, I want project-scope command usage to create required project settings files so that command works in a clean repo.
- As a package maintainer, I want repo root to become a publishable Pi package installable with `pi install` so that package can be shared and reused like `pi-gizmo` and `pi-system-prompt`.
- As a maintainer, I want README and changelog to explain scope behavior, install flow, and user-visible changes so that users can trust what the package edits and why.

## Scope

### In Scope

- Convert repo root into a documented Pi package using package structure patterns established by `/Users/magimetal/Dev/pi/pi-gizmo` and `/Users/magimetal/Dev/pi/pi-system-prompt`.
- Ship one extension package named `pi-skill-controller` that exposes `/sc:global` and `/sc:project` commands.
- Support enable and disable operations for an individual skill at global scope through `~/.pi/agent/settings.json`.
- Support enable and disable operations for an individual skill at project scope through project `.pi/settings.json`.
- Create project `.pi/settings.json` and parent `.pi/` directory when user invokes project-scope command in a repo that does not yet have them.
- Preserve unrelated settings content when commands update either settings file.
- Use documented Pi configuration mechanisms and package/resource filtering behavior from Pi docs rather than inventing undocumented package manifest keys.
- Document install flow, command usage, scope semantics, file mutation behavior, and safety notes in `README.md`.
- Add `CHANGELOG.md` using Keep a Changelog structure for package introduction and subsequent user-facing changes.
- Add verification coverage for command registration, settings mutation, project settings bootstrap, and package installability expectations.

### Out of Scope

- Managing prompts, themes, extensions, agents, or packages outside skill-loading controls.
- Building a GUI, TUI panel, or `/settings` replacement for interactive browsing of all resources.
- Synchronizing settings across machines, cloud accounts, or repositories.
- Editing skill source files or changing skill contents; feature only controls whether skills load.
- Broad Pi core changes outside this package repository.
- Publishing to npm or cutting release tags as part of PRD authoring itself.

## Acceptance Criteria

- [ ] Repo root contains publishable Pi package metadata with `pi-package` discoverability, documented Pi manifest or convention-directory usage, and install surface compatible with `pi install` from local path and git source.
- [ ] Package registers exactly two user-facing command entrypoints: `/sc:global` and `/sc:project`.
- [ ] `/sc:global` can enable or disable one individual skill by name in `~/.pi/agent/settings.json` without deleting unrelated keys or unrelated package/resource filters.
- [ ] `/sc:project` can enable or disable one individual skill by name in `.pi/settings.json`, creating `.pi/settings.json` when missing and preserving unrelated project settings when file already exists.
- [ ] When both scopes define behavior for same package or skill, project-scope behavior follows documented Pi override semantics instead of inventing conflicting precedence rules.
- [ ] Command output clearly states action taken, target skill, target scope, exact file path changed, and resulting state; no silent file mutation.
- [ ] README documents install instructions, command grammar, global-versus-project behavior, project settings auto-creation behavior, and at least one worked example for each scope.
- [ ] `CHANGELOG.md` exists in Keep a Changelog format and includes initial user-facing entry for `pi-skill-controller`, referencing PRD-0001.
- [ ] Automated tests cover command registration, settings-file mutation, preservation of unrelated settings keys, and project `.pi/settings.json` bootstrap behavior.
- [ ] Verification flow includes package-focused checks appropriate for a publishable Pi package, including package artifact/installability validation modeled after example repos.

## Technical Surface

- **Package root:** `package.json`, shipped file allowlist, `pi` manifest or convention directories, package keywords, repository metadata, publish config, and any required peer dependencies for Pi runtime imports.
- **Extension runtime:** `extensions/` entrypoint plus command implementation files that parse user intent, resolve scope, read/write JSON settings safely, and report transcript-visible results.
- **Project settings targets:** global `~/.pi/agent/settings.json` and project `.pi/settings.json`, including creation of project `.pi/` directory and file when absent.
- **Documentation:** `README.md` for install and command usage, `CHANGELOG.md` for release history, and package-facing notes needed for users to understand scope and safety.
- **Tests:** `tests/` coverage for command registration, settings persistence behavior, scope precedence, bootstrap path creation, and regression protection for user-facing output.
- **Verification/publish baseline:** repo scripts, CI workflow, and tarball/install validation shape needed to support package confidence similar to example repos.
- **Authority references:** Pi package behavior from `docs/packages.md`; settings merge and package filtering semantics from `docs/settings.md`; structure examples from `/Users/magimetal/Dev/pi/pi-gizmo` and `/Users/magimetal/Dev/pi/pi-system-prompt`.
- **Related ADRs:** None currently. If implementation needs a new undocumented settings model or broader Pi configuration contract, record ADR before widening architecture.

## UX Notes

- Command names stay terse and scope-first. User should never guess whether write target is global or project.
- Responses must say what changed, where it changed, and why that scope was chosen.
- Project-scope first run should explicitly say when `.pi/settings.json` was created instead of implying file already existed.
- Error copy should help users recover from unknown skill names, malformed settings JSON, or unsupported targets without exposing raw stack noise.
- Commands should feel safe and operational, not magical. No hidden background edits.
- README examples should make override behavior obvious: global default plus project-specific exception.

## Open Questions

- What exact documented settings representation should v1 mutate for per-skill enable/disable when skills may come from package manifests, skill directories, or explicit `skills` settings paths?
- Should v1 operate on all discovered skills in active config, or only package-managed skills whose load behavior can be expressed through documented filters without ambiguity?
- What final command grammar best balances clarity and brevity: positional verbs (`/sc:global disable gizmo`) versus flag-style arguments?

## Revision History

- 2026-04-22: Draft created
- 2026-04-22: Promoted Draft → Active; implementation begins per plan `docs/plans/pi-skill-controller-package-implementation.md` (PLAN_REVIEW PASS).
