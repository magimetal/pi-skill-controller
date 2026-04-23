# Plan: pi-skill-controller Package Implementation

- **Status:** Draft
- **Date:** 2026-04-22
- **Objective:** Turn `/Users/magimetal/Dev/pi/pi-skill-controller` into publishable Pi package that adds `/sc:global` and `/sc:project`, presents interactive skill enable/disable controls, persists global state in `~/.pi/agent/settings.json`, bootstraps project `.pi/settings.json` when missing, and ships README, changelog, verification baseline, commit, and push sequence.
- **Plan path:** `docs/plans/pi-skill-controller-package-implementation.md`
- **PRD path:** `docs/prd/0001-pi-skill-controller-package-and-scoped-skill-loading.md`
- **Target repo:** `/Users/magimetal/Dev/pi/pi-skill-controller`
- **Reference repos:**
  - `/Users/magimetal/Dev/pi/pi-gizmo`
  - `/Users/magimetal/Dev/pi/pi-system-prompt`
- **Authority docs:**
  - `/Users/magimetal/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/packages.md`
  - `/Users/magimetal/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/settings.md`
  - `/Users/magimetal/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
  - `/Users/magimetal/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/skills.md`

## Scope

In scope:
- repo-root Pi package setup
- interactive `/sc:global` and `/sc:project` command UX
- skill discovery and per-scope settings mutation
- project `.pi/settings.json` bootstrap on demand
- automated tests and package verification baseline
- `README.md`, `CHANGELOG.md`, package metadata, commit, and push workflow

Out of scope:
- Pi core changes outside this repo
- managing prompts, themes, extensions, or agents beyond preserving existing package filters
- new GUI/settings app beyond command-scoped interactive control
- npm publish or release tagging

## Current Evidence

### Repo state now

- **Observed:** `README.md` contains placeholder title only.
- **Observed:** `docs/prd/0001-pi-skill-controller-package-and-scoped-skill-loading.md` already exists and matches requested feature scope.
- **Observed:** repo currently lacks `package.json`, `CHANGELOG.md`, `extensions/`, `tests/`, and `.github/workflows/`.
- **Observed:** `git remote -v` points at `git@github.com:magimetal/pi-skill-controller.git`.
- **Observed:** `git status --short --branch` reports `## main...origin/main` plus untracked `.pi-lens/` and `docs/`.
- **Observed:** `pi` CLI is installed and returns version `0.68.1`.

### Example/package signals

- **Observed:** `pi-gizmo` and `pi-system-prompt` both use repo root as package root, declare `keywords: ["pi-package"]`, ship `README.md` and `CHANGELOG.md`, and verify with `npm test`, `npm run typecheck`, and `npm pack --dry-run`.
- **Observed:** Pi package docs support `pi.extensions`, convention directories, local-path installs, git-source installs, project-local installs via `pi install -l`, and package filtering by resource type.
- **Observed:** Pi extension/RPC docs define command inspection proof paths via runtime `pi.getCommands()` and RPC `get_commands`; both expose registered slash commands with source metadata.
- **Observed:** Pi settings docs define scope split: `~/.pi/agent/settings.json` global, `.pi/settings.json` project, with project override semantics, and document exact operators `+path` and `-path` for settings-array force-include and force-exclude behavior.
- **Observed:** Pi package docs document package filters as layered on top of manifest entries, with `+path` and `-path` exact paths relative to package root.
- **Observed:** Pi package docs define local package identity by resolved absolute path, so cross-scope overrides for same local package must normalize to one absolute `source` identity.
- **Observed:** Pi extensions support `ctx.ui.select`, `ctx.ui.confirm`, `ctx.ui.input`, and `ctx.ui.custom(..., { overlay: true })` for interactive controls.

### Implementation constraints implied by docs

- **Observed:** package filtering object form lives inside `settings.json` `packages` entries; omitted resource keys load all of that resource type.
- **Observed:** if same package appears in global and project settings, project entry wins.
- **Inferred:** no documented public extension API exposes full discovered-skill inventory plus disabled entries; package should not depend on undocumented internal `dist/` imports for runtime behavior.
- **Inferred:** extension must own JSON/file-system based discovery + mutation logic to keep behavior stable and documented.

## UX Decision

### Decision 1 — command surface stays scope-first

- **Decision:** ship exactly `/sc:global` and `/sc:project`.
- **Why:** user should know write target before interaction starts.

### Decision 2 — overlay selector, not positional verb grammar

- **Decision:** commands open searchable overlay UI using `ctx.ui.custom(..., { overlay: true })`.
- **Why:** request explicitly calls for interactive controls; overlay avoids turning command into brittle flag grammar.
- **Interaction contract:**
  - optional command args seed initial search text
  - search box filters skills
  - arrow keys navigate
  - Enter toggles focused skill enabled/disabled state in memory
  - Ctrl+S persists
  - Esc cancels without writing
  - footer explains exact target file and unsaved state

### Decision 3 — show disambiguation data in list/detail area

- **Decision:** each row must show skill name plus source label/path summary and effective enabled state.
- **Why:** same skill name can exist in multiple directories or packages; blind toggles are unsafe.

### Decision 4 — write only on explicit save

- **Decision:** no mutation during navigation or toggle; persist only after explicit save.
- **Why:** command must feel safe, auditable, and reversible before write.

## Settings Persistence Model

### Operator Contract for Per-Skill Toggles

- **Bare exact path** (string entry without `+` or `-` prefix) is a **source/include entry**. It tells Pi to discover skills under that path. It is NOT a per-skill toggle override and MUST NOT be used to express enabled or disabled state for an individual skill that lives below an existing source.
- **`+path`** (force-include override) is the only documented way to re-enable a specific skill path that would otherwise be excluded by a broader filter (e.g. parent directory excluded, or package skill filter narrowed).
- **`-path`** (force-exclude override) is the only documented way to disable a specific skill path that would otherwise be included by a broader source/include entry or default package load.
- Operators apply to the same array semantics in both top-level `skills` (settings-relative paths) and package object-form filter `skills` (package-root-relative paths).

### Toggle State Transitions

#### Top-level / auto-discovered skill source

- **Disable from default-enabled state:**
  - Preserve existing bare source entries.
  - Append `-relative/path/to/skill-dir` to the same `skills` array in the target settings file.
  - Path is relative to the directory containing that `settings.json`; fall back to absolute path only if relative resolution would be invalid.
- **Re-enable previously disabled skill:**
  - Remove the matching `-relative/path/to/skill-dir` entry.
  - Add `+relative/path/to/skill-dir` only if a remaining broader exclusion (e.g. parent `-dir` or package-level narrowing) would still hide the skill; otherwise no `+path` is needed.
- **Disable a skill not currently covered by any include source:** add a `+path` is NOT correct; instead add the parent source (bare path) plus a `-path` only for the targeted skill, or refuse the toggle and surface an unsupported-source error.

#### Package-managed skill source

- Operate inside the package entry's object-form `skills` filter array, not the top-level `skills` array.
- **Disable a default-loaded packaged skill:**
  - Convert string-form package entry to object-form for that source if needed (preserving any pre-existing non-skill filters; see Decision 8).
  - Append `-relative/path/to/skill-dir` (relative to package root) to the package's `skills` filter.
- **Re-enable a packaged skill previously disabled in same scope:**
  - Remove matching `-relative/path/to/skill-dir` from the package's `skills` filter.
  - Add `+relative/path/to/skill-dir` only if remaining filter state (e.g. an explicit narrower include list) would still exclude it; otherwise no `+path` is needed.
- **Re-enable in project scope a packaged skill disabled in global scope:**
  - Create or update the project package entry using normalized identity (Decision 7).
  - Add `+relative/path/to/skill-dir` to the project package `skills` filter so project-wins precedence force-includes the skill regardless of global `-path`.
- **Disable in project scope a packaged skill enabled by global default:**
  - Create or update the project package entry using normalized identity, copy forward non-skill filters (Decision 8).
  - Add `-relative/path/to/skill-dir` to the project package `skills` filter.

### Decision 5 — mutate documented settings only

- **Decision:** persist by editing only documented `skills`, `packages`, and `enableSkillCommands`-adjacent structures in target settings files.
- **Why:** PRD forbids invented configuration model.

### Decision 6 — local and auto-discovered skills use exact `+path`/`-path` overrides

- **Decision:** for top-level or auto-discovered skill sources, preserve source directory entries and serialize per-skill state in target `skills` array with documented exact operators: `+relative/path/to/skill-dir` for force-include and `-relative/path/to/skill-dir` for force-exclude.
- **Why:** settings docs define exact-path operator contract; bare exact paths are ambiguous and collision-prone when same skill name appears in multiple sources.
- **Serialization rule:** prefer exact relative skill-dir paths from settings base dir; use absolute path only if relative path would be invalid.

### Decision 7 — package-managed skills normalize package entry only when needed

- **Decision:** if touched skill comes from package source:
  - keep existing package entry if already object-form
  - convert string-form package entry to object-form only for touched source
  - store skill filters with documented exact operators (`+relative/path/to/skill-dir` and `-relative/path/to/skill-dir`) relative to package root
  - when creating cross-scope override for local package source, normalize `source` to resolved absolute path before write so global and project entries refer to same package identity
- **Why:** package-managed skills need per-package filter persistence without inventing new keys, and local package deduplication uses resolved absolute path identity.

### Decision 8 — preserve non-skill package filters when project scope overrides global package

- **Decision:** when `/sc:project` creates or updates project package override for package already configured globally with object-form filters, copy forward existing non-skill resource filters (`extensions`, `prompts`, `themes`) into normalized project entry before adding `skills` filter.
- **Why:** project package entry wins entire package identity; omitting existing non-skill filters could widen or alter unrelated package behavior.

## Expected Files During Execution

### New or updated repo files

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vitest.config.ts`
- `.gitignore`
- `README.md`
- `CHANGELOG.md`
- `extensions/skill-controller.ts`
- `extensions/skill-controller/create-skill-controller-extension.ts`
- `extensions/skill-controller/commands.ts`
- `extensions/skill-controller/discovery.ts`
- `extensions/skill-controller/settings-store.ts`
- `extensions/skill-controller/serialization.ts`
- `extensions/skill-controller/ui.ts`
- `extensions/skill-controller/types.ts`
- `tests/skill-controller.commands.test.ts`
- `tests/skill-controller.discovery.test.ts`
- `tests/skill-controller.settings-store.test.ts`
- `tests/test-support/skill-controller-fixtures.ts`
- `.github/workflows/ci.yml`
- `LICENSE` *(only if missing and required for publishable package baseline)*

### External settings targets touched by runtime, not repo authoring

- `~/.pi/agent/settings.json`
- `.pi/settings.json`

## Phase 1 — Discovery Model and Serialization Contract

### Milestone

Execution begins with deterministic model for skill inventory, source classification, and safe settings serialization.

### Task 1.1 — inventory controllable skill source types

- **What:** classify supported skill sources into top-level local, auto-discovered local, and package-managed, then map each to write strategy.
- **References:**
  - `docs/skills.md`
  - `docs/settings.md`
  - `docs/packages.md`
  - `extensions/skill-controller/discovery.ts`
  - `extensions/skill-controller/types.ts`
- **Acceptance criteria:** one `SkillRecord` model exists covering at least name, file path, source kind, source identifier, owning scope, effective enabled state, and target settings file.
- **Guardrails:** do not import undocumented internal Pi runtime modules for discovery; do not assume skill names are unique.
- **Verification:** unit tests demonstrate records for package-managed skill, explicit settings skill directory, and auto-discovered `.pi/skills` or `~/.pi/agent/skills` skill.

### Task 1.2 — lock exact-path serialization rules

- **What:** define how enabled/disabled toggles become documented exact `skills` and package-filter entries using `+path` and `-path` without changing unrelated settings.
- **References:**
  - `docs/settings.md`
  - `docs/packages.md`
  - `extensions/skill-controller/serialization.ts`
- **Acceptance criteria:** serializer covers:
  - disable transition emits exact `-path` entry for chosen skill
  - re-enable transition removes stale `-path` and emits exact `+path` when needed to override broader exclusion state
  - preserve untouched patterns, plain source entries, and unrelated resource filters
  - use exact skill-dir paths for collisions
- **Guardrails:** do not invent custom JSON keys; do not rewrite unrelated package/resource sections; do not rely on undocumented internal Pi files for operator semantics.
- **Verification:** serializer tests assert before/after JSON for local skills array and package skills filters, including `+path`/`-path` behavior and project override package entry.

### Task 1.3 — define project-bootstrap behavior

- **What:** specify `.pi/` directory and `.pi/settings.json` creation flow for first `/sc:project` save.
- **References:**
  - `docs/settings.md`
  - `extensions/skill-controller/settings-store.ts`
  - `tests/skill-controller.settings-store.test.ts`
- **Acceptance criteria:** missing project file path leads to minimal valid JSON creation, preserving existing file if present, and transcript/UI copy states file creation explicitly.
- **Guardrails:** do not create `.pi/settings.json` on command open; create only on explicit save.
- **Verification:** unit test starts with no `.pi/` directory and asserts created file path plus expected JSON content.

## Phase 2 — Package Baseline and Runtime Skeleton

### Milestone

Repo becomes root-level Pi package with extension entrypoint, dev scripts, and quality baseline.

### Task 2.1 — author repo-root package manifest and support files

- **What:** create `package.json`, package lock, TypeScript/Vitest config, ignore rules, and publish allowlist patterned after sibling repos.
- **References:**
  - `/Users/magimetal/Dev/pi/pi-gizmo/package.json`
  - `/Users/magimetal/Dev/pi/pi-system-prompt/package.json`
  - `docs/packages.md`
  - `package.json`
- **Acceptance criteria:** manifest includes package metadata, `keywords` with `pi-package`, `pi.extensions` pointing at `./extensions/skill-controller.ts`, scripts for `test`, `typecheck`, and `check`, and only import-backed Pi peers.
- **Guardrails:** do not add undocumented `pi` keys; do not bundle Pi runtime modules in `dependencies`; do not ship `.pi-lens/` or other junk.
- **Verification:** later execution commands must pass:
  ```bash
  npm install
  npm run typecheck
  npm test
  npm pack --dry-run
  ```

### Task 2.2 — build extension entrypoint and command registration skeleton

- **What:** add thin entrypoint and focused internal modules for commands, discovery, settings store, serialization, UI, and types.
- **References:**
  - `/Users/magimetal/Dev/pi/pi-system-prompt/extensions/system-prompt.ts`
  - `/Users/magimetal/Dev/pi/pi-gizmo/extensions/gizmo.ts`
  - `extensions/skill-controller.ts`
  - `extensions/skill-controller/create-skill-controller-extension.ts`
- **Acceptance criteria:** entrypoint registers `/sc:global` and `/sc:project`, module split matches planned responsibilities, and no file mixes UI, discovery, and JSON mutation into one opaque block.
- **Guardrails:** keep entrypoint thin; avoid undocumented imports from Pi internal `dist/` paths; no dead exports.
- **Verification:** command registration test asserts both slash commands and user-facing descriptions.

### Task 2.3 — add lightweight CI verification

- **What:** add `.github/workflows/ci.yml` to run package checks suitable for publishable package confidence.
- **References:**
  - `/Users/magimetal/Dev/pi/pi-gizmo/.github/workflows/ci.yml`
  - `/Users/magimetal/Dev/pi/pi-system-prompt/.github/workflows/ci.yml`
  - `.github/workflows/ci.yml`
- **Acceptance criteria:** CI runs install, typecheck, tests, and `npm pack --dry-run` or equivalent packed-artifact smoke check.
- **Guardrails:** keep workflow scoped to this package; do not add release automation yet.
- **Verification:** workflow YAML reviewed; later remote run expected green.

## Phase 3 — Interactive Command UX

### Milestone

Commands open safe interactive selector, show exact scope/file target, and persist only on save.

### Task 3.1 — implement discovery-backed selector model

- **What:** derive display rows from discovered skills, grouped and labeled for current target scope.
- **References:**
  - `extensions/skill-controller/discovery.ts`
  - `extensions/skill-controller/ui.ts`
  - `docs/extensions.md`
  - `examples/extensions/overlay-test.ts`
- **Acceptance criteria:** selector shows at minimum skill name, source summary, effective enabled state, and target file label; optional command args prefill search query.
- **Guardrails:** do not hide collisions; do not display ambiguous same-name entries without path/source hint.
- **Verification:** UI-facing tests or command tests assert rendered labels for collision case and filtered search seed behavior.

### Task 3.2 — implement overlay interaction contract

- **What:** wire search, navigation, toggle, save, and cancel behavior.
- **References:**
  - `extensions/skill-controller/ui.ts`
  - `/Users/magimetal/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
  - `/Users/magimetal/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/overlay-test.ts`
- **Acceptance criteria:**
  - Enter toggles selected skill in memory
  - Ctrl+S persists
  - Esc cancels without write
  - footer shows unsaved state and target scope
- **Guardrails:** no write on mere toggle; no silent save on close; no hidden background mutation.
- **Verification:** command tests simulate toggle/save/cancel and assert write/no-write outcomes.

### Task 3.3 — implement user-visible result copy

- **What:** return transcript/UI copy stating action, skill, scope, exact file path changed, and resulting state.
- **References:**
  - `docs/prd/0001-pi-skill-controller-package-and-scoped-skill-loading.md`
  - `extensions/skill-controller/commands.ts`
- **Acceptance criteria:** success copy names scope, skill, file path, and created-file note when applicable; error copy covers malformed JSON, unknown source mapping, and write failures without raw stack spam.
- **Guardrails:** no vague “updated settings” message; no silent creation of `.pi/settings.json`.
- **Verification:** command tests assert exact message fragments for global save, project bootstrap save, cancel, and malformed JSON failure.

## Phase 4 — Settings Mutation and Regression Coverage

### Milestone

Runtime safely edits documented settings across common source shapes and guards against precedence drift.

### Task 4.1 — implement settings file read/merge/write layer

- **What:** add JSON loader/writer that preserves unrelated keys and normalizes touched sections only.
- **References:**
  - `extensions/skill-controller/settings-store.ts`
  - `extensions/skill-controller/serialization.ts`
  - `tests/skill-controller.settings-store.test.ts`
- **Acceptance criteria:** writes preserve unrelated top-level keys, preserve package entries not touched, and maintain valid JSON after repeated toggles.
- **Guardrails:** do not overwrite whole settings object for one toggle; do not strip comments if unsupported input format already invalid JSON.
- **Verification:** tests cover unrelated key preservation, repeated toggle idempotence, and malformed JSON rejection.

### Task 4.2 — handle package override precedence correctly

- **What:** support project-scope edits when skill source belongs to package configured globally, including copy-forward of existing non-skill filters and normalization of local package source identity so global and project entries resolve to the same absolute package root.
- **References:**
  - `docs/packages.md`
  - `docs/settings.md`
  - `extensions/skill-controller/serialization.ts`
  - `tests/skill-controller.settings-store.test.ts`
- **Acceptance criteria:**
  - When project-scope save targets a globally configured local package, normalize the package `source` against the project settings base directory (or write absolute path) so the resulting project package entry resolves to the same absolute package root as the global entry.
  - The resulting project package entry preserves effective non-skill filters (`extensions`, `prompts`, `themes`) carried forward from the global entry.
  - Only the package `skills` filter behavior changes; no other resource type filter is widened or narrowed.
  - Project package entry exists as a single, deduplicated identity in the project `packages` array (no parallel relative + absolute duplicates).
  - Project-wins precedence holds: at runtime the project entry overrides the global entry for the same package identity.
- **Guardrails:** do not unintentionally widen extensions/prompts/themes for touched package; do not duplicate same package source multiple times in same scope; do not let relative local package paths drift across settings bases.
- **Verification:** regression test:
  - Seeds global `~/.pi/agent/settings.json` with object-form package entry whose `source` is a relative local path (e.g. `./packages/example`) plus non-skill filters set on `extensions`, `prompts`, and `themes`.
  - Seeds empty (or missing) project `.pi/settings.json` under a different working directory so the relative source would resolve differently from the project base.
  - Performs a project-scope skill toggle on a skill owned by that package.
  - Asserts the new project package entry resolves to the same absolute package root as the global entry (normalized `source` is either the project-base-relative path that resolves identically or the absolute path).
  - Asserts the project package entry retains the same non-skill filters originally present on the global entry.
  - Asserts only the `skills` filter differs and reflects the toggle (`+path` or `-path` per Operator Contract).
  - Asserts project-wins precedence: a separate resolution check (or load-order assertion) confirms the project entry overrides the global entry for that package identity.

### Task 4.3 — cover collision and ambiguity cases

- **What:** add tests for same skill name from different sources and for unsupported/ambiguous ownership mapping.
- **References:**
  - `tests/skill-controller.discovery.test.ts`
  - `tests/skill-controller.commands.test.ts`
- **Acceptance criteria:** collisions stay distinguishable in UI model; ambiguous write target fails with clear error instead of mutating guessed entry.
- **Guardrails:** no first-match guessing for duplicate names; no write when ownership cannot be proven.
- **Verification:** tests assert collision labels and blocked-save behavior for ambiguous source mapping.

## Phase 5 — README, CHANGELOG, and Publish Readiness

### Milestone

Package is understandable, installable, and verification instructions match actual behavior.

### Task 5.1 — rewrite `README.md`

- **What:** document install flow, command usage, interaction model, scope semantics, and exact file mutation behavior.
- **References:**
  - `README.md`
  - `/Users/magimetal/Dev/pi/pi-gizmo/README.md`
  - `/Users/magimetal/Dev/pi/pi-system-prompt/README.md`
  - PRD-0001
- **Acceptance criteria:** README includes:
  - git and local install commands
  - `/sc:global` and `/sc:project` usage
  - search/toggle/save/cancel keys
  - global vs project behavior
  - `.pi/settings.json` auto-creation note
  - at least one worked example per scope
  - security/safety note explaining exact settings files mutated
- **Guardrails:** do not document behavior not covered by tests; do not imply prompts/themes/agents management.
- **Verification:** manual readback against tested behavior plus `npm pack --dry-run` shipped-file review.

### Task 5.2 — add `CHANGELOG.md`

- **What:** create Keep a Changelog file with initial unreleased or `0.1.0` entry referencing PRD-0001.
- **References:**
  - `CHANGELOG.md`
  - `/Users/magimetal/Dev/pi/pi-gizmo/CHANGELOG.md`
  - `/Users/magimetal/Dev/pi/pi-system-prompt/CHANGELOG.md`
  - `docs/prd/0001-pi-skill-controller-package-and-scoped-skill-loading.md`
- **Acceptance criteria:** changelog records user-facing command addition, scoped settings persistence, project bootstrap behavior, and package publish baseline.
- **Guardrails:** no internal-only noise; no undocumented release claims.
- **Verification:** changelog entry reviewed against shipped behavior and PRD scope.

### Task 5.3 — verify packed artifact and installed command surface

- **What:** prove package works as package, not only as checked-out source, and verify installed runtime recognizes command surface through documented command-inspection APIs rather than config UI commands, with probes executed from scope-correct working directories.
- **References:**
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `docs/packages.md`
  - `docs/extensions.md`
  - `docs/rpc.md`
- **Acceptance criteria:** isolated environment checks prove package installs globally and project-locally from local path, `pi list` shows expected source, and documented command inspection (`get_commands` RPC or runtime `pi.getCommands()`) proves `/sc:global` and `/sc:project` are registered from installed package state before manual smoke begins in both scopes: global probe from neutral temp cwd and project-local probe from temp repo cwd that contains `.pi/settings.json`.
- **Guardrails:** do not verify against ambient personal `~/.pi/agent/settings.json`; use fresh temp `HOME` and temp repo; do not use `pi config`, `/help`, or undocumented command listing as proof for installed-command registration; use minimal runtime startup for command recognition (`PI_OFFLINE=1`, `--no-session`, `--no-context-files`, `--no-skills`, `--no-prompt-templates`, `--no-themes`); run project-local command inspection from temp repo cwd so local `.pi/settings.json` scope is actually active; if runtime cannot return command inventory, stop and record blocker with exact startup/error output instead of claiming command verification.
- **Verification:** run during execution phase:
  ```bash
  npm install
  npm run typecheck
  npm test
  npm pack --dry-run

  TMP_HOME="$(mktemp -d)"
  TMP_REPO="$(mktemp -d)"
  TMP_CWD_GLOBAL="$(mktemp -d)"

  HOME="$TMP_HOME" pi install /Users/magimetal/Dev/pi/pi-skill-controller
  (
    cd "$TMP_CWD_GLOBAL" &&
    HOME="$TMP_HOME" pi list
  )

  (
    cd "$TMP_REPO" &&
    HOME="$TMP_HOME" pi install -l /Users/magimetal/Dev/pi/pi-skill-controller &&
    HOME="$TMP_HOME" pi list
  )
  ```
  Installed-command surface assertion (MUST run before manual smoke):
  - After global install, assert `/sc:global` and `/sc:project` are available from installed package state using documented command inspection run from global-scope cwd (`$TMP_CWD_GLOBAL`). Acceptable evidence is one of:
    - RPC probe:
      ```bash
      (
        cd "$TMP_CWD_GLOBAL" &&
        printf '%s\n' '{"id":"get-commands","type":"get_commands"}' |
          HOME="$TMP_HOME" PI_OFFLINE=1 pi --mode rpc --no-session --no-context-files --no-skills --no-prompt-templates --no-themes
      )
      ```
    - Runtime probe extension that calls `pi.getCommands()` and prints/asserts both commands with `sourceInfo.path` pointing at installed package files.
  - After project-local install, repeat same assertion from project-scope repo cwd (`$TMP_REPO`), not from arbitrary cwd, so `.pi/settings.json` local package registration is in active scope:
    - RPC probe:
      ```bash
      (
        cd "$TMP_REPO" &&
        printf '%s\n' '{"id":"get-commands","type":"get_commands"}' |
          HOME="$TMP_HOME" PI_OFFLINE=1 pi --mode rpc --no-session --no-context-files --no-skills --no-prompt-templates --no-themes
      )
      ```
    - Or runtime probe extension with same cwd requirement.
  - For both probes, assert response contains both command names with extension source metadata from installed `pi-skill-controller` package.
  - If either scope-specific assertion fails, STOP and record blocker with exact command output. Do NOT proceed to manual smoke and do NOT claim command verification.

  Manual command check inside isolated runtime (only after both command-inventory assertions above pass):
  - from `$TMP_CWD_GLOBAL`, run `/sc:global`, confirm command resolves from installed package, then cancel with `Esc`
  - from `$TMP_REPO`, run `/sc:project`, confirm command resolves from installed package, then cancel with `Esc`
  - if runtime fails before prompt, capture exact error and mark execution blocked for installed-command verification

## Phase 6 — Final Verification, Commit, and Push

### Milestone

Changeset is validated, summarized, committed, and pushed after evidence exists.

### Task 6.1 — run end-to-end manual command smoke checks

- **What:** exercise both commands in isolated temp environments with seeded skills and inspect resulting JSON.
- **References:**
  - `README.md`
  - `tests/test-support/skill-controller-fixtures.ts`
  - temp `HOME` and temp repo fixtures
- **Acceptance criteria:**
  - `/sc:global` toggles one skill and updates `~/.pi/agent/settings.json`
  - `/sc:project` creates `.pi/settings.json` when missing and updates only project scope
  - command output reports exact file path and resulting state
- **Guardrails:** do not treat unit tests as substitute for package-loaded smoke test; do not use live personal settings as proof.
- **Verification:** capture exact commands plus before/after JSON snippets in execution notes.

### Task 6.2 — final repo hygiene and shipped-file audit

- **What:** remove dead imports/exports, verify package `files` allowlist, and confirm no accidental junk ships.
- **References:**
  - `package.json`
  - modified source files
- **Acceptance criteria:** no unused exports/imports in changed code; packed artifact excludes `.pi-lens/`, temp files, and tests if intentionally omitted.
- **Guardrails:** do not leave dead helper modules after refactor; do not ship local caches.
- **Verification:** typecheck, lint if added, and `npm pack --dry-run` file list inspection.

### Task 6.3 — commit and push only after verification passes

- **What:** create one commit summarizing package feature, then push to `origin`.
- **References:**
  - `git status`
  - `git log --oneline -n 5`
  - `origin git@github.com:magimetal/pi-skill-controller.git`
- **Acceptance criteria:** commit message names `pi-skill-controller` package feature; push succeeds to remote branch containing verified code.
- **Guardrails:** do not commit failing verification state; do not push partial docs-only scaffold.
- **Verification:** run during execution phase:
  ```bash
  git status --short
  git add <verified files>
  git commit -m "Add pi-skill-controller scoped skill controls"
  git push origin HEAD
  ```

### Task 6.4 — verify pushed git-source install compatibility

- **What:** after push succeeds, verify package installs from remote git source and exposes command surface through documented command inspection, proving compatibility beyond local-path install, with probes executed from scope-correct working directories.
- **References:**
  - `docs/packages.md`
  - `docs/extensions.md`
  - `docs/rpc.md`
  - `origin git@github.com:magimetal/pi-skill-controller.git`
- **Acceptance criteria:** fresh isolated environment installs package from pushed git source, `pi list` shows git-backed source, and documented command inspection (`get_commands` RPC or runtime `pi.getCommands()`) proves `/sc:global` and `/sc:project` are registered from git-installed package state in both scopes: global probe from neutral temp cwd and project-local probe from temp repo cwd that contains `.pi/settings.json`.
- **Guardrails:** do not reuse local-path install as substitute for git-source proof; do not rely on unpublished local filesystem state; use pushed branch/ref explicitly so verification targets exact remote code under test; run project-local command inspection from temp repo cwd so local `.pi/settings.json` scope is actually active; if git auth/network blocks install, capture exact failure and mark git-source verification blocked rather than passing.
- **Verification:** run during execution phase after `git push origin HEAD`:
  ```bash
  CURRENT_BRANCH="$(git branch --show-current)"
  TMP_HOME_GIT="$(mktemp -d)"
  TMP_REPO_GIT="$(mktemp -d)"
  TMP_CWD_GLOBAL_GIT="$(mktemp -d)"

  HOME="$TMP_HOME_GIT" GIT_TERMINAL_PROMPT=0 pi install "git:git@github.com:magimetal/pi-skill-controller.git@$CURRENT_BRANCH"
  (
    cd "$TMP_CWD_GLOBAL_GIT" &&
    HOME="$TMP_HOME_GIT" pi list
  )

  (
    cd "$TMP_REPO_GIT" &&
    HOME="$TMP_HOME_GIT" GIT_TERMINAL_PROMPT=0 pi install -l "git:git@github.com:magimetal/pi-skill-controller.git@$CURRENT_BRANCH" &&
    HOME="$TMP_HOME_GIT" pi list
  )

  (
    cd "$TMP_CWD_GLOBAL_GIT" &&
    printf '%s\n' '{"id":"get-commands","type":"get_commands"}' |
      HOME="$TMP_HOME_GIT" PI_OFFLINE=1 pi --mode rpc --no-session --no-context-files --no-skills --no-prompt-templates --no-themes
  )

  (
    cd "$TMP_REPO_GIT" &&
    printf '%s\n' '{"id":"get-commands","type":"get_commands"}' |
      HOME="$TMP_HOME_GIT" PI_OFFLINE=1 pi --mode rpc --no-session --no-context-files --no-skills --no-prompt-templates --no-themes
  )
  ```
  Git-installed command assertion:
  - Assert global-scope probe from `$TMP_CWD_GLOBAL_GIT` contains `/sc:global` and `/sc:project` entries from installed git package source.
  - Assert project-local probe from `$TMP_REPO_GIT` contains same commands from installed git package source.
  - If RPC path is insufficient in execution environment, run documented runtime probe extension using `pi.getCommands()` with same cwd requirements and capture output instead.

## Verification Matrix

### Automated

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run check` *(if manifest defines it)*
- `npm pack --dry-run`

### Package/install

- isolated global install via fresh `HOME`
- isolated project-local install via fresh temp repo + `pi install -l`
- isolated post-push git-source global install
- isolated post-push git-source project-local install via fresh temp repo + `pi install -l`
- `pi list` from scope-correct cwd for each install type
- documented command inspection via RPC `get_commands` or runtime `pi.getCommands()` from neutral temp cwd for global scope and temp repo cwd for project scope
- minimal isolated runtime startup/manual smoke only after command inventory confirms `/sc:global` and `/sc:project` in both scope-correct cwd contexts

### Manual

- `/sc:global` toggle + save
- `/sc:project` first-save bootstrap
- duplicate-name skill disambiguation in selector
- cancel path confirms no file write
- malformed JSON failure path shows safe error

## Risks and Unknowns

- **Observed risk:** project package override semantics can widen unrelated package resources if non-skill filters are not copied forward.
- **Observed risk:** same-name skill collisions across directories/packages require explicit path labeling and exact-path serialization.
- **Inferred risk:** because no documented extension API exposes disabled skill inventory, discovery code must mirror documented file-system rules carefully.
- **Unknown:** whether current repo should also add release workflow or only CI. Default recommendation: CI only for this implementation unless publish automation is explicitly requested during execution.

## Exit Criteria

- package installs from repo root with `pi install`
- pushed remote installs from git source with `pi install "git:...@$CURRENT_BRANCH"`
- documented command inspection proves installed package runtime registers `/sc:global` and `/sc:project` from scope-correct cwd in both global and project-local installs, then manual runtime smoke proves they resolve and open interactive selector
- target settings files mutate only on explicit save
- project bootstrap path proven
- README and CHANGELOG match verified behavior
- commit and push completed after evidence-backed verification
