# pi-skill-controller

`pi-skill-controller` adds two scoped commands for interactive skill toggling:

```text
/sc:global
/sc:project
```

Package writes only documented Pi settings fields. Global command edits `~/.pi/agent/settings.json`. Project command edits `.pi/settings.json` and creates `.pi/` plus `.pi/settings.json` only when you explicitly save.

## Install

### From git

```bash
pi install git:github.com/magimetal/pi-skill-controller
```

### Project-local from git

```bash
pi install -l git:github.com/magimetal/pi-skill-controller
```

### From local checkout

```bash
pi install /absolute/path/to/pi-skill-controller
# or project-local
pi install -l /absolute/path/to/pi-skill-controller
```

Reload Pi after install:

```text
/reload
```

## Commands

```text
/sc:global [search]
/sc:project [search]
```

Optional trailing text seeds search filter inside overlay.

Examples:

```text
/sc:global gizmo
/sc:project browser
```

## Interaction model

Overlay shows:

- skill name
- enabled or disabled state
- source label for collision disambiguation
- exact relative skill path
- target scope reminder
- unsaved change count

Keys:

- `↑` / `↓` move selection
- type text to filter
- `Backspace` edit filter
- `Enter` toggle selected skill in memory only
- `Ctrl+S` save to settings file
- `Esc` cancel without writing

Important behavior:

- toggles do **not** write on selection
- write happens only on `Ctrl+S`
- cancel path leaves files unchanged
- success message reports scope, resulting state, and exact file path written

## Scope semantics

### `/sc:global`

Writes `~/.pi/agent/settings.json`.

Typical use:

- keep noisy skill disabled everywhere
- enable personal default skill set once

Worked example:

1. run `/sc:global`
2. select `gizmo`
3. press `Enter` to flip state
4. press `Ctrl+S`
5. package writes `~/.pi/agent/settings.json`

If disabling auto-discovered local skill under `~/.pi/agent/skills/gizmo`, resulting settings change looks like:

```json
{
  "skills": ["-skills/gizmo"]
}
```

### `/sc:project`

Writes `.pi/settings.json` for current project.

Typical use:

- keep skill disabled globally but enable for one repo
- disable one package-provided skill only in current project

Worked example:

1. run `/sc:project`
2. select skill for current repo
3. press `Enter`
4. press `Ctrl+S`
5. if `.pi/settings.json` does not exist yet, package creates it at save time

For first project save, file can start as small valid JSON like:

```json
{
  "skills": ["-skills/example-skill"]
}
```

## Package and settings behavior

Package uses documented Pi settings/package semantics only.

What it changes:

- top-level `skills` array for local or auto-discovered skills
- object-form `packages` entries and package `skills` filters for package-managed skills discovered from local, npm, or git package sources

What it preserves:

- unrelated top-level settings keys
- unrelated package entries
- existing `extensions`, `prompts`, and `themes` package filters
- exact `+path` / `-path` operator contract

Local package override detail:

- when `/sc:project` overrides skill from globally configured local package, package normalizes project package `source` so it resolves to same absolute package root
- non-skill filters copy forward into project override so project scope does not accidentally widen unrelated resources

## Duplicate skill names

Pi can discover same skill name from multiple places. Overlay labels each row with source context so toggles stay precise.

Examples:

- `shared-skill · package:team-tools`
- `shared-skill · .pi/skills`

## Safety

This package edits real Pi settings files:

- `~/.pi/agent/settings.json`
- `.pi/settings.json`

No ambient config should be trusted during validation. For testing, use temp `HOME` and temp repos. Review package source before installing from third parties. Skills and extensions run with full system access.

## Development

```bash
npm install
npm run typecheck
npm test
npm run check
npm pack --dry-run
```

## Verification shape

Local-path verification used for this package:

```bash
npm install
npm run typecheck
npm test
npm run check
npm pack --dry-run
```

Installed command-surface verification should use isolated temp environments plus documented command inspection:

- global install from neutral cwd
- project-local install from repo cwd with `.pi/settings.json` scope active
- RPC `get_commands` or runtime `pi.getCommands()` proving `/sc:global` and `/sc:project`

## License

MIT
