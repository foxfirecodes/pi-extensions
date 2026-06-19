# @foxfirecodes/pi-usage

## Unreleased

### Patch Changes

- Parse Pi slash command arguments as strings so `/usage --all`, `/usage --backfill`, and `--path` are honored in the TUI.
- Show scanned session/file/error counts for lifetime reports even when no files are found.
- Backfill lifetime usage from multiple Pi session roots, including `$PI_SESSION_DIR`, `$PI_CODING_AGENT_DIR/sessions`, `~/.pi/agent/sessions`, and `~/.pi/sessions`.
- Add `/usage --backfill` as an explicit alias for scanning persisted session files.

## 0.1.0

### Minor Changes

- Initial Pi usage reporting extension with current-session and all-session reports.
