# @foxfirecodes/pi-usage

## Unreleased

### Patch Changes

- Backfill lifetime usage from multiple Pi session roots, including `$PI_SESSION_DIR`, `$PI_CODING_AGENT_DIR/sessions`, `~/.pi/agent/sessions`, and `~/.pi/sessions`.
- Add `/usage --backfill` as an explicit alias for scanning persisted session files.

## 0.1.0

### Minor Changes

- Initial Pi usage reporting extension with current-session and all-session reports.
