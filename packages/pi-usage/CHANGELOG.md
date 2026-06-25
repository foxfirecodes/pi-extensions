# @foxfirecodes/pi-usage

## 0.1.1

### Patch Changes

- b951edb: Cache lifetime usage scans per session file and reuse warmed all-session cache entries for project-scoped usage reports.
- f1136cb: Add project-scoped lifetime usage scans, robust slash command argument parsing, scan summaries, and backfill support across Pi session roots.

## Unreleased

### Patch Changes

- Add `/usage --project` to scan persisted sessions for only the current project, with optional `--path` filtering.
- Parse Pi slash command arguments as strings so `/usage --all`, `/usage --backfill`, and `--path` are honored in the TUI.
- Show scanned session/file/error counts for lifetime reports even when no files are found.
- Backfill lifetime usage from multiple Pi session roots, including `$PI_SESSION_DIR`, `$PI_CODING_AGENT_DIR/sessions`, `~/.pi/agent/sessions`, and `~/.pi/sessions`.
- Add `/usage --backfill` as an explicit alias for scanning persisted session files.

## 0.1.0

### Minor Changes

- Initial Pi usage reporting extension with current-session and all-session reports.
